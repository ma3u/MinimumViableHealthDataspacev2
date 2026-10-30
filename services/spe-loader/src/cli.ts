#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import neo4j, { type Driver } from "neo4j-driver";
import { newExtractKey, seal } from "./crypto.js";
import { parseJsonl, toJsonl, type ExtractHeader } from "./extract.js";
import { exportExtract, recordPermit } from "./hub.js";
import { KbsError, kbsAdmin, kbsClient, type ReferenceValue } from "./kbs.js";
import {
  ingest,
  sessionWorkspace,
  unlock,
  type UnlockOutcome,
} from "./load.js";
import { hostDataMatchesPolicy, inspectPlatform } from "./platform.js";
import { policyHash, workloadFrom } from "./policy-hash.js";
import { renderResourcePolicy } from "./trustee-policy.js";
import { keyPath, speByNumber } from "./spes.js";

// ---------------------------------------------------------------------------
// spe-loader: one image, the subcommands of ADR-068's extract and workspace
// ---------------------------------------------------------------------------
const USAGE = `spe-loader <command> [options]

  policy-hash --workload <file.json>                 the permit's policy hash of a pod spec
  trustee-configure [--resource-policy <file.rego> | --resource-policy-template <file.tmpl>
                     --policy-hashes '{"spe-1":"sha256:..."}'] [--reference-values <file.json|json>]
                                                     the access body's policy and reference values
  record-permit --spe <1|2> --policy-hash <sha256:...> the permit records its policy hash (hub)
  export  --spe <1|2> [--out <file.jsonl>]           hub graph to a plain extract (for inspection)
  encrypt --in <file.jsonl> --out <file.enc>         seal it under a new key and put the key into Trustee
  extract --spe <1|2> --out <file.enc> [--record-permit]
                                                     export + encrypt in memory: no plaintext on disk
  unlock  --spe <1|2> --in <file.enc> --work <dir>   attest, fetch the key, decrypt into <dir> (init container)
  ingest  --spe <1|2> --work <dir> [--stay]          load what unlock left into the workspace (sidecar)
  load    --spe <1|2> --in <file.enc>                unlock + ingest (compose one-shot)

Options for export/extract: --permit <id> (SPE_PERMIT_ID), --workload <file.json> or
--policy-hash <sha256:...> (SPE_POLICY_HASH). Trustee: TRUSTEE_URL, TRUSTEE_ADMIN_TOKEN_FILE,
TRUSTEE_CERT_FILE. Neo4j: HUB_NEO4J_URI/_USER/_PASSWORD, WORKSPACE_NEO4J_URI/_USER/_PASSWORD.
Exit codes: 0 done, 1 error, 2 a database or Trustee did not answer, 3 the key was refused.`;

const env = (name: string, fallback = ""): string =>
  process.env[name] ?? fallback;
const log = (msg: string) => process.stderr.write(`[spe-loader] ${msg}\n`);

function cypherDir(): string {
  const configured = process.env.SPE_CYPHER_DIR;
  if (configured) return configured;
  if (existsSync("/app/neo4j/init-schema.cypher")) return "/app/neo4j";
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../neo4j");
}

async function connect(
  prefix: "HUB" | "WORKSPACE",
  fallbackUri: string,
  attempts = 60,
): Promise<Driver> {
  const uri = env(`${prefix}_NEO4J_URI`, fallbackUri);
  // A password file (ACI: the group's secret volume) wins over the variable.
  const passwordFile = process.env[`${prefix}_NEO4J_PASSWORD_FILE`];
  const password = passwordFile
    ? readFileSync(passwordFile, "utf8").trim()
    : env(`${prefix}_NEO4J_PASSWORD`, "healthdataspace");
  const driver = neo4j.driver(
    uri,
    neo4j.auth.basic(env(`${prefix}_NEO4J_USER`, "neo4j"), password),
  );
  for (let i = 1; ; i++) {
    try {
      await driver.verifyConnectivity();
      log(`${prefix.toLowerCase()} answers at ${uri}`);
      return driver;
    } catch (err) {
      if (i >= attempts) {
        await driver.close();
        log(
          `${prefix.toLowerCase()} did not answer at ${uri}: ${
            (err as Error).message
          }`,
        );
        process.exit(2);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * The permit's policy hash: from a workload description (compose), given
 * as sha256:<hex> (ACI: the ccePolicy's hash, from 21-aci-confidential-spe.sh
 * --policy), or none yet when `optional` (ACI extracts are sealed before the
 * policy exists; the workspace's own evidence then supplies it).
 */
function resolvePolicyHash(
  values: Record<string, unknown>,
  optional = false,
): string | null {
  const file =
    (values.workload as string | undefined) ?? process.env.SPE_WORKLOAD_FILE;
  if (file)
    return policyHash(workloadFrom(JSON.parse(readFileSync(file, "utf8"))));
  const given =
    (values["policy-hash"] as string | undefined) ??
    process.env.SPE_POLICY_HASH;
  if (given && /^sha256:[0-9a-f]{64}$/.test(given)) return given;
  if (given) throw new Error("--policy-hash must be sha256:<64 lowercase hex>");
  if (optional) return null;
  throw new Error(
    "a policy hash is needed: --workload <pod spec json> or --policy-hash sha256:<64 hex>",
  );
}

/** A JSON object given inline (starts with `{`) or as a file path. */
function jsonArg<T>(value: string): T {
  return JSON.parse(
    value.trim().startsWith("{") ? value : readFileSync(value, "utf8"),
  ) as T;
}

function trusteeUrl(): string {
  const url = env("TRUSTEE_URL");
  if (!url) throw new Error("TRUSTEE_URL is not set");
  return url;
}

function adminToken(): string {
  const file = env("TRUSTEE_ADMIN_TOKEN_FILE");
  if (!file || !existsSync(file))
    throw new Error("TRUSTEE_ADMIN_TOKEN_FILE does not name a readable file");
  return file;
}

/** Retries an admin call while Trustee is still starting (a refusal is not retried). */
async function withTrustee(
  call: () => Promise<void>,
  attempts = 30,
): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (err) {
      if ((err instanceof KbsError && err.denied) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function sealAndStore(
  plaintext: Buffer,
  header: ExtractHeader,
  n: 1 | 2,
): Promise<Buffer> {
  const key = newExtractKey();
  try {
    const envelope = seal(plaintext, key, {
      speId: header.speId,
      permitId: header.permitId,
      keyPath: keyPath(n),
      policyHash: header.policyHash,
      createdAt: header.createdAt,
    });
    const admin = kbsAdmin({
      url: trusteeUrl(),
      adminTokenFile: adminToken(),
      certFile: process.env.TRUSTEE_CERT_FILE,
      binary: process.env.KBS_CLIENT,
    });
    await withTrustee(() => admin.setResource(keyPath(n), key));
    log(
      `key for ${header.speId} put into Trustee at ${keyPath(
        n,
      )} (not written anywhere else)`,
    );
    return envelope;
  } finally {
    key.fill(0);
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      spe: { type: "string" },
      permit: { type: "string" },
      workload: { type: "string" },
      "policy-hash": { type: "string" },
      in: { type: "string" },
      out: { type: "string" },
      work: { type: "string" },
      "record-permit": { type: "boolean", default: false },
      "resource-policy": { type: "string" },
      "resource-policy-template": { type: "string" },
      "policy-hashes": { type: "string" },
      "reference-values": { type: "string" },
      stay: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const permitId =
    (values.permit as string | undefined) ??
    env("SPE_PERMIT_ID", "hdab-medreg-spe-2026-001");

  switch (command) {
    case "policy-hash": {
      process.stdout.write(`${resolvePolicyHash(values)}\n`);
      return 0;
    }
    case "trustee-configure": {
      // The access body's side of Trustee: the resource policy and the
      // reference values the attestation policy compares the evidence with.
      const admin = kbsAdmin({
        url: trusteeUrl(),
        adminTokenFile: adminToken(),
        certFile: process.env.TRUSTEE_CERT_FILE,
        binary: process.env.KBS_CLIENT,
      });
      let policy = values["resource-policy"] as string | undefined;
      const template = values["resource-policy-template"] as string | undefined;
      if (template) {
        const hashes = jsonArg<Record<string, string>>(
          (values["policy-hashes"] as string | undefined) ??
            env("SPE_POLICY_HASHES", "{}"),
        );
        const dir = mkdtempSync(join(tmpdir(), "spe-policy-"));
        policy = join(dir, "resource.rego");
        writeFileSync(
          policy,
          renderResourcePolicy(readFileSync(template, "utf8"), hashes),
        );
        log(
          `resource policy rendered from ${template} for ${Object.keys(hashes)
            .sort()
            .join(", ")}`,
        );
      }
      if (policy) {
        const file = policy;
        await withTrustee(() => admin.setResourcePolicy(file));
        log(`resource policy set from ${file}`);
      }
      const rvArg = values["reference-values"] as string | undefined;
      if (rvArg) {
        const rv = jsonArg<Record<string, ReferenceValue>>(rvArg);
        const names = Object.keys(rv).filter((n) => !n.startsWith("_"));
        for (const name of names) {
          if (JSON.stringify(rv[name]).includes("REPLACE")) {
            throw new Error(
              `reference value '${name}' is still a placeholder; take it from the first attestation (21-aci-confidential-spe.sh --check)`,
            );
          }
        }
        for (const name of names)
          await withTrustee(() => admin.setReferenceValue(name, rv[name]));
        log(`${names.length} reference values set`);
      }
      return 0;
    }
    case "record-permit": {
      // ACI: the permit records the ccePolicy hash once --policy has it.
      const spe = speByNumber(String(values.spe));
      const hash = resolvePolicyHash(values);
      if (!hash) throw new Error("record-permit needs --policy-hash");
      const hub = await connect("HUB", "bolt://neo4j:7687");
      try {
        const w = hub.session({ database: "neo4j" });
        await recordPermit(w, {
          permitId,
          policyHash: hash,
          speId: spe.id,
          keyPath: keyPath(spe.n),
          holder: spe.holder,
        });
        await w.close();
        log(`permit ${permitId} records ${hash} for ${spe.id}`);
        return 0;
      } finally {
        await hub.close();
      }
    }
    case "export":
    case "extract": {
      const spe = speByNumber(String(values.spe));
      const hash = resolvePolicyHash(values, true);
      const hub = await connect("HUB", "bolt://neo4j:7687");
      try {
        const session = hub.session({
          database: "neo4j",
          defaultAccessMode: neo4j.session.READ,
        });
        const extract = await exportExtract(session, spe, {
          permitId,
          policyHash: hash,
        });
        await session.close();
        const h = extract.header;
        log(
          `${spe.id} (${spe.holder}): ${h.patients} of ${h.eligible} synthetic patients, ${h.nodes} nodes, ${h.relationships} relationships`,
        );
        const jsonl = Buffer.from(toJsonl(extract), "utf8");
        if (command === "export") {
          if (values.out)
            writeFileSync(values.out as string, jsonl, { mode: 0o600 });
          else process.stdout.write(jsonl);
          return 0;
        }
        if (!values.out) throw new Error("extract needs --out <file.enc>");
        const envelope = await sealAndStore(jsonl, h, spe.n);
        writeFileSync(values.out as string, envelope);
        log(
          `sealed extract written to ${values.out} (${envelope.length} bytes)`,
        );
        if (values["record-permit"] && hash) {
          const w = hub.session({ database: "neo4j" });
          await recordPermit(w, {
            permitId,
            policyHash: hash,
            speId: spe.id,
            keyPath: keyPath(spe.n),
            holder: spe.holder,
          });
          await w.close();
          log(`permit ${permitId} records ${hash} for ${spe.id}`);
        }
        return 0;
      } finally {
        await hub.close();
      }
    }
    case "encrypt": {
      if (!values.in || !values.out)
        throw new Error("encrypt needs --in and --out");
      const plaintext = readFileSync(values.in as string);
      const { header } = parseJsonl(plaintext.toString("utf8"));
      const n = speByNumber(header.speId).n;
      writeFileSync(
        values.out as string,
        await sealAndStore(plaintext, header, n),
      );
      log(`sealed ${header.speId}'s extract to ${values.out}`);
      return 0;
    }
    case "unlock":
    case "load": {
      const spe = speByNumber(String(values.spe));
      if (!values.in) throw new Error(`${command} needs --in <file.enc>`);
      const envelope = readFileSync(values.in as string);
      const platform = inspectPlatform(process.env, log);
      const kbs = kbsClient({
        url: trusteeUrl(),
        certFile: process.env.TRUSTEE_CERT_FILE,
        binary: process.env.KBS_CLIENT,
      });
      let result: Awaited<ReturnType<typeof unlock>>;
      try {
        result = await unlock(envelope, {
          kbs,
          spe,
          attempts: Number(env("TRUSTEE_ATTEMPTS", "40")),
          intervalMs: Number(env("TRUSTEE_INTERVAL_MS", "15000")),
          log,
        });
      } finally {
        kbs.close();
      }
      const a = result.outcome.attestation;
      const matches = hostDataMatchesPolicy(
        platform,
        a?.record.claims.hostData ?? null,
      );
      result.outcome.platform = {
        ...platform,
        hostDataMatchesSecurityPolicy: matches,
      };
      if (matches === false)
        log(
          "HOST_DATA in the report is NOT the hash of the UVM's security policy file",
        );
      if (a && !a.simulated) {
        // Public platform values, for the access body to pin as reference
        // values on the first run (21-aci-confidential-spe.sh --check).
        log(`pinnable claims: ${JSON.stringify(a.evidence)}`);
      }
      if (command === "unlock") {
        const work = (values.work as string | undefined) ?? "/work";
        mkdirSync(work, { recursive: true });
        writeFileSync(
          join(work, "unlock.json"),
          JSON.stringify(result.outcome, null, 2),
          { mode: 0o600 },
        );
        if (result.plaintext)
          writeFileSync(join(work, "extract.jsonl"), result.plaintext, {
            mode: 0o600,
          });
        log(
          result.outcome.ok
            ? "unlocked; the sidecar loads it"
            : `refused: ${result.outcome.reason}`,
        );
        // 0 either way: the pod must start so the refusal can be recorded and read.
        return 0;
      }
      return runIngest(spe.n, result.outcome, result.plaintext, false);
    }
    case "ingest": {
      const spe = speByNumber(String(values.spe));
      const work = (values.work as string | undefined) ?? "/work";
      const outcome = JSON.parse(
        readFileSync(join(work, "unlock.json"), "utf8"),
      ) as UnlockOutcome;
      const file = join(work, "extract.jsonl");
      const plaintext = existsSync(file) ? readFileSync(file) : null;
      const code = await runIngest(
        spe.n,
        outcome,
        plaintext,
        Boolean(values.stay),
      );
      // The plain extract has done its job; the data now lives in Neo4j's memory-backed store.
      if (plaintext) rmSync(file, { force: true });
      if (values.stay) {
        log("loaded; staying up so the pod keeps running");
        await new Promise(() => undefined);
      }
      return code;
    }
    default:
      process.stderr.write(`${USAGE}\n`);
      return command ? 1 : 0;
  }
}

async function runIngest(
  n: 1 | 2,
  outcome: UnlockOutcome,
  plaintext: Buffer | null,
  stay: boolean,
): Promise<number> {
  const spe = speByNumber(n);
  const ws = await connect(
    "WORKSPACE",
    "bolt://localhost:7687",
    stay ? 120 : 60,
  );
  try {
    const session = ws.session({ database: "neo4j" });
    try {
      const res = await ingest(outcome, plaintext, {
        workspace: sessionWorkspace(session),
        spe,
        runsOn: env("SPE_RUNS_ON", "Docker Compose (local)"),
        cypherDir: cypherDir(),
        log,
      });
      return res.status === "refused" ? 3 : 0;
    } finally {
      await session.close();
    }
  } finally {
    await ws.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`error: ${(err as Error).message}`);
    process.exit(1);
  },
);
