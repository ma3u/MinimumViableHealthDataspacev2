/**
 * The only thing in this system that holds a credential.
 *
 *   iPhone ──user id token──▶ this service ──workload JWT──▶ /v1/oauth/token
 *                                          ──sk-ant-oat01──▶ /v1/messages
 *
 * The phone authenticates the user. This service authenticates itself with an
 * Azure managed identity it never sees the key for, exchanges that for a
 * short-lived Anthropic token, and calls the API. No `sk-ant-...` key exists in
 * the repository, the image, the app, or anyone's environment.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { entraConfigFromEnv, fetchIdentityToken } from "./entra.js";
import { FederatedCredentials, FederationError } from "./wif.js";
import {
  UnauthorizedError,
  userAuthConfigFromEnv,
  verifyUser,
} from "./verify-user.js";
import {
  RefusedError,
  SYSTEM_PROMPT,
  renderValues,
  vet,
  type AnalyseRequest,
} from "./analyse.js";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
const MAX_BODY_BYTES = 256 * 1024;

function federationConfigFromEnv() {
  const required = [
    "ANTHROPIC_FEDERATION_RULE_ID",
    "ANTHROPIC_ORGANIZATION_ID",
    "ANTHROPIC_SERVICE_ACCOUNT_ID",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new FederationError(
      `missing federation environment: ${missing.join(", ")}`,
    );
  }
  return {
    federationRuleId: process.env.ANTHROPIC_FEDERATION_RULE_ID!,
    organizationId: process.env.ANTHROPIC_ORGANIZATION_ID!,
    serviceAccountId: process.env.ANTHROPIC_SERVICE_ACCOUNT_ID!,
    workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES)
      throw new RefusedError("refused: request body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(body);
}

export function createApp(credentials: FederatedCredentials) {
  const userAuth = userAuthConfigFromEnv();

  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        // Deliberately says nothing about the token itself, only that one
        // exists. A health endpoint that leaks credential state is a gift.
        send(response, 200, {
          status: "ok",
          credentialCached: credentials.expiresAt !== undefined,
        });
        return;
      }

      if (request.method !== "POST" || request.url !== "/v1/analyse") {
        send(response, 404, { error: "not found" });
        return;
      }

      const header = request.headers.authorization ?? "";
      const idToken = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!idToken) throw new UnauthorizedError("missing bearer id token");

      const { subject } = await verifyUser(idToken, userAuth);
      const parsed = JSON.parse(await readBody(request)) as AnalyseRequest;
      const { values, question } = vet(parsed);

      // Logged without a single measurement in it. The count and the codes are
      // enough to debug a bad request; the numbers are the thing we are here to
      // protect, and a log file is the easiest place in any system to forget
      // that.
      console.log(
        JSON.stringify({
          event: "analyse",
          subject: subject.slice(0, 8),
          valueCount: values.length,
          codes: values.map((v) => v.loinc),
        }),
      );

      const token = await credentials.get();
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                renderValues(values),
                "",
                question || "Please explain these values.",
              ].join("\n"),
            },
          ],
        }),
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        send(response, 502, {
          error: "upstream call failed",
          status: upstream.status,
          detail: detail.slice(0, 300),
        });
        return;
      }

      const message = (await upstream.json()) as {
        content?: { type: string; text?: string }[];
      };
      const text = (message.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n");

      send(response, 200, { text, model: MODEL, provider: "anthropic" });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        send(response, 401, { error: error.message });
        return;
      }
      if (error instanceof RefusedError) {
        send(response, 400, { error: error.message });
        return;
      }
      if (error instanceof FederationError) {
        // The detail is configuration, not user data, and it is exactly what is
        // needed to fix a rule that does not match.
        console.error(
          JSON.stringify({
            event: "federation_error",
            message: error.message,
            detail: error.detail,
          }),
        );
        send(response, 503, { error: "federation unavailable" });
        return;
      }
      console.error(
        JSON.stringify({
          event: "error",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
      send(response, 500, { error: "internal error" });
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  const entra = entraConfigFromEnv();
  const credentials = new FederatedCredentials(
    () => fetchIdentityToken(entra),
    federationConfigFromEnv(),
  );
  const port = Number(process.env.PORT ?? 8080);
  createApp(credentials).listen(port, () => {
    console.log(JSON.stringify({ event: "listening", port, model: MODEL }));
  });
}
