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
import {
  describeUnverifiedToken,
  entraConfigFromEnv,
  fetchIdentityToken,
} from "./entra.js";
import {
  FederatedCredentials,
  FederationError,
  type FederationConfig,
} from "./wif.js";
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

/**
 * Resolves the federation configuration, or reports what is missing.
 *
 * Never throws at startup. The setup order is forced and looks circular: the
 * Claude Console cannot be configured until it is given the exact issuer and
 * audience of a real token, and only a running container can produce one. An
 * app that refuses to boot without `fdrl_...` can therefore never be used to
 * obtain the `fdrl_...`. That is a deadlock dressed as validation, and this
 * deployment hit it.
 *
 * So a half-configured deployment starts, serves `/health` naming precisely
 * which variables are missing, and refuses `/v1/analyse` with the same list.
 */
export function federationConfigFromEnv(env: NodeJS.ProcessEnv = process.env): {
  config?: FederationConfig;
  missing: string[];
} {
  const required = [
    "ANTHROPIC_FEDERATION_RULE_ID",
    "ANTHROPIC_ORGANIZATION_ID",
    "ANTHROPIC_SERVICE_ACCOUNT_ID",
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) return { missing };
  return {
    missing: [],
    config: {
      federationRuleId: env.ANTHROPIC_FEDERATION_RULE_ID!,
      organizationId: env.ANTHROPIC_ORGANIZATION_ID!,
      serviceAccountId: env.ANTHROPIC_SERVICE_ACCOUNT_ID!,
      workspaceId: env.ANTHROPIC_WORKSPACE_ID,
    },
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

export function createApp(
  credentials: FederatedCredentials | undefined,
  federationMissing: string[] = [],
) {
  // Resolved lazily rather than at construction. The two halves of this system
  // are configured at different times: federation can be proven working before
  // a user-facing identity provider exists at all. Throwing here would turn a
  // half-configured deployment into a crash loop, which reports the problem as
  // "the container will not start" rather than as "set USER_OIDC_ISSUER".
  let userAuth: ReturnType<typeof userAuthConfigFromEnv> | undefined;
  let userAuthError: string | undefined;
  try {
    userAuth = userAuthConfigFromEnv();
  } catch (error) {
    userAuthError = error instanceof Error ? error.message : "unknown";
  }

  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        // Says which halves are configured and nothing about the token
        // itself. A health endpoint that leaks credential state is a gift.
        // Reporting the missing variable names by name is the difference
        // between a deployment someone can finish and one they have to guess at.
        send(response, 200, {
          status: userAuth && credentials ? "ok" : "incomplete",
          credentialCached: credentials?.expiresAt !== undefined,
          federationConfigured: credentials !== undefined,
          userAuthConfigured: userAuth !== undefined,
          ...(federationMissing.length > 0 ? { federationMissing } : {}),
          ...(userAuthError ? { userAuthError } : {}),
        });
        return;
      }

      if (request.method === "GET" && request.url === "/setup/claims") {
        // A self-closing diagnostic. Registering a federation issuer needs the
        // exact `iss` and `aud` of a real token, and Azure emits two issuer
        // forms that differ only in shape, so guessing produces a signature
        // failure with no hint which was expected. `az containerapp exec` needs
        // a TTY and is not always available, so the app reports its own claims.
        //
        // It answers only while federation is unconfigured, which is precisely
        // the setup window, and disappears the moment the rule is applied. A
        // permanent endpoint publishing a tenant id would be a needless gift;
        // one that closes behind itself cannot be forgotten about.
        if (credentials) {
          send(response, 404, { error: "not found" });
          return;
        }
        try {
          const entra = entraConfigFromEnv();
          const claims = describeUnverifiedToken(
            await fetchIdentityToken(entra),
          );
          // The token itself is never returned. These are configuration
          // identifiers; the token is a credential.
          send(response, 200, {
            issuerUrl: claims.issuer,
            matchAudience: claims.audience,
            jwksSource: "discovery",
            note: "Register these in Settings, Workload identity, Connect workload. Match on the audience AND a subject or claim: a rule matching only the issuer accepts every workload in the tenant.",
          });
        } catch (error) {
          send(response, 503, {
            error: "could not obtain a managed identity token",
            detail: error instanceof Error ? error.message : "unknown",
          });
        }
        return;
      }

      if (request.method !== "POST" || request.url !== "/v1/analyse") {
        send(response, 404, { error: "not found" });
        return;
      }

      if (!credentials) {
        send(response, 503, {
          error: "federation is not configured on this deployment",
          missing: federationMissing,
        });
        return;
      }

      if (!userAuth) {
        // 503 rather than 500: this is a deployment that is not finished, not
        // a request that went wrong, and the message says which knob is missing.
        send(response, 503, {
          error: "user authentication is not configured on this deployment",
          detail: userAuthError,
        });
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
  const { config, missing } = federationConfigFromEnv();
  let credentials: FederatedCredentials | undefined;
  if (config) {
    const entra = entraConfigFromEnv();
    credentials = new FederatedCredentials(
      () => fetchIdentityToken(entra),
      config,
    );
  }

  const port = Number(process.env.PORT ?? 8080);
  createApp(credentials, missing).listen(port, () => {
    console.log(
      JSON.stringify({
        event: "listening",
        port,
        model: MODEL,
        federationConfigured: credentials !== undefined,
        ...(missing.length > 0 ? { federationMissing: missing } : {}),
      }),
    );
  });
}
