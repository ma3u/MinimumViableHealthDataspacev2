import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Trustee's KBS through kbs-client (Trustee v0.22.0, tools/kbs-client)
// ---------------------------------------------------------------------------
//
// The attester is chosen by the kbs-client build: the published image has the
// sample attester only (M1), kbs-client.azure.Dockerfile adds the Azure SEV-SNP
// vTPM attester (A1). Arguments go to execFile, never through a shell, and
// stdout is never logged: get-resource prints the key.

export interface Kbs {
  /** Attests and returns the EAR token. */
  attest(): Promise<string>;
  /** The resource at `path`, released against `token`. Rejects on a policy denial. */
  getResource(path: string, token: string): Promise<Buffer>;
}

export interface KbsAdmin {
  setResource(path: string, value: Buffer): Promise<void>;
  setResourcePolicy(regoFile: string): Promise<void>;
  /** One RVPS reference value through the sample extractor (Trustee's admin API). */
  setReferenceValue(name: string, value: ReferenceValue): Promise<void>;
}

/**
 * A scalar, or a list of scalars any one of which matches. kbs-client sets a
 * list of one; a longer list goes to the admin API directly
 * (referenceValueBody), as the TCB of the hosts an ACI group lands on
 * differs (#774).
 */
type Scalar = string | number | boolean;
export type ReferenceValue = Scalar | Scalar[];

/** kbs-client arguments for one reference value. */
export function referenceValueArgs(
  name: string,
  value: ReferenceValue,
): string[] {
  if (!/^[A-Za-z0-9_.-]+$/.test(name))
    throw new Error(`refusing reference value name '${name}'`);
  const single = !Array.isArray(value);
  const v = Array.isArray(value) ? value[0] : value;
  const list = value as unknown;
  if (Array.isArray(list) && list.length !== 1) {
    throw new Error(
      `reference value '${name}': kbs-client sets one value, got ${list.length}`,
    );
  }
  const type =
    typeof v === "number"
      ? ["--as-integer"]
      : typeof v === "boolean"
        ? ["--as-bool"]
        : [];
  return [
    "set-sample-reference-value",
    name,
    String(v),
    ...type,
    ...(single ? ["--as-single-value"] : []),
  ];
}

/**
 * The admin API's body for one reference value, the sample provenance
 * kbs-client's set_sample_rv sends (Trustee v0.22.0, tools/kbs-client/src/
 * lib.rs), with the whole list in it.
 */
export function referenceValueBody(name: string, values: Scalar[]): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name))
    throw new Error(`refusing reference value name '${name}'`);
  const payload = Buffer.from(JSON.stringify({ [name]: values })).toString(
    "base64",
  );
  return JSON.stringify({ version: "0.1.0", type: "sample", payload });
}

function postReferenceValue(
  url: string,
  tokenFile: string,
  certFile: string | undefined,
  body: string,
  timeoutMs: number,
): Promise<void> {
  const token = readFileSync(tokenFile, "utf8").trim();
  return new Promise((resolve, reject) => {
    const req = request(
      `${url.replace(/\/$/, "")}/kbs/v0/reference-value`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        ...(certFile ? { ca: readFileSync(certFile) } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          res.statusCode === 200
            ? resolve()
            : reject(
                new KbsError(
                  `reference value: Trustee answered ${
                    res.statusCode
                  }: ${text.slice(0, 300)}`,
                  false,
                ),
              ),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("reference value: timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

export class KbsError extends Error {
  constructor(
    message: string,
    readonly denied: boolean,
  ) {
    super(message);
    this.name = "KbsError";
  }
}

/**
 * kbs-client's stderr in one line: the KBS error types and details it
 * reports, then its final `Error:` line, without terminal colour codes.
 */
export function kbsErrorSummary(stderr: string): string {
  // eslint-disable-next-line no-control-regex
  const text = stderr.replace(/\u001b\[[0-9;]*m/g, "");
  const parts: string[] = [];
  for (const m of text.matchAll(
    /error_type: "[^"]*\/errors\/([A-Za-z]+)",\s*detail: "([^"]*)"/g,
  )) {
    const part = `${m[1]}: ${m[2]}`;
    if (!parts.includes(part)) parts.push(part);
  }
  const last = text
    .trim()
    .split("\n")
    .reverse()
    .find((l) => l.startsWith("Error:"));
  if (last) parts.push(last.trim());
  return parts.length > 0
    ? parts.join("; ")
    : text.trim().split("\n").slice(-3).join(" | ");
}

type Runner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

function run(binary: string, timeoutMs: number): Runner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        binary,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? "warn" },
        },
        (err, stdout, stderr) => {
          if (err) {
            // stderr only: kbs-client prints errors there, and the key to stdout.
            const text = String(stderr);
            const denied =
              /PolicyDeny|Access denied by policy|unauthorized/i.test(text);
            reject(new KbsError(kbsErrorSummary(text) || err.message, denied));
            return;
          }
          resolve({ stdout: String(stdout), stderr: String(stderr) });
        },
      );
    });
}

/** A kbs-client session: one TEE key pair, so the token and the resource belong together. */
export function kbsClient(opts: {
  url: string;
  binary?: string;
  certFile?: string;
  timeoutMs?: number;
}): Kbs & { close(): void } {
  const exec = run(opts.binary ?? "kbs-client", opts.timeoutMs ?? 120_000);
  const dir = mkdtempSync(join(tmpdir(), "spe-tee-"));
  const teeKey = join(dir, "tee.pem");
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(teeKey, privateKey, { mode: 0o600 });
  const base = [
    "--url",
    opts.url,
    ...(opts.certFile ? ["--cert-file", opts.certFile] : []),
  ];
  return {
    async attest() {
      const { stdout } = await exec([
        ...base,
        "attest",
        "--tee-key-file",
        teeKey,
      ]);
      const token = stdout.trim().split("\n").pop() ?? "";
      if (token.split(".").length !== 3)
        throw new KbsError("kbs-client attest returned no token", false);
      return token;
    },
    async getResource(path, token) {
      const tokenFile = join(dir, "token.jwt");
      writeFileSync(tokenFile, token, { mode: 0o600 });
      const { stdout } = await exec([
        ...base,
        "get-resource",
        "--path",
        path,
        "--attestation-token",
        tokenFile,
        "--tee-key-file",
        teeKey,
      ]);
      return Buffer.from(stdout.trim(), "base64");
    },
    close() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The access body's side: puts an extract key into Trustee with the admin token. */
export function kbsAdmin(opts: {
  url: string;
  adminTokenFile: string;
  binary?: string;
  certFile?: string;
  timeoutMs?: number;
}): KbsAdmin {
  const exec = run(opts.binary ?? "kbs-client", opts.timeoutMs ?? 60_000);
  const base = [
    "--url",
    opts.url,
    ...(opts.certFile ? ["--cert-file", opts.certFile] : []),
  ];
  const config = [...base, "config", "--admin-token-file", opts.adminTokenFile];
  return {
    async setResourcePolicy(regoFile) {
      await exec([...config, "set-resource-policy", "--policy-file", regoFile]);
    },
    async setReferenceValue(name, value) {
      if (Array.isArray(value) && value.length > 1) {
        await postReferenceValue(
          opts.url,
          opts.adminTokenFile,
          opts.certFile,
          referenceValueBody(name, value),
          opts.timeoutMs ?? 60_000,
        );
        return;
      }
      await exec([...config, ...referenceValueArgs(name, value)]);
    },
    async setResource(path, value) {
      const dir = mkdtempSync(join(tmpdir(), "spe-key-"));
      const file = join(dir, "key.bin");
      try {
        writeFileSync(file, value, { mode: 0o600 });
        // kbs-client echoes the resource in base64 on success: discarded here.
        await exec([
          ...config,
          "set-resource",
          "--path",
          path,
          "--resource-file",
          file,
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
