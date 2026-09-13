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
import { RefusedError, vet, type AnalyseRequest } from "./analyse.js";
import {
  AnthropicProvider,
  AzureProvider,
  type Provider,
  type ProviderName,
} from "./providers.js";
import {
  DEFAULT_DAILY_LIMIT,
  MemoryQuotaStore,
  type QuotaStore,
} from "./quota.js";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
// The deployment must be DataZoneStandard. GlobalStandard gives no EU-only
// guarantee and would undo the only reason Azure is the default (ADR-033, #187).
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5-mini-eu";
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const DAILY_LIMIT = Number(
  process.env.DAILY_ANALYSIS_LIMIT ?? DEFAULT_DAILY_LIMIT,
);
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
  providers: Partial<Record<ProviderName, Provider>> = {},
  quotaStore: QuotaStore = new MemoryQuotaStore(),
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
      const { values, question, provider } = vet(parsed);

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

      // The quota is consumed before the provider is called, not after. A
      // request that fails upstream has still cost the operator nothing, but
      // charging only on success would let a client retry a deliberately bad
      // request without limit.
      const quota = await quotaStore.consume(subject, DAILY_LIMIT);
      if (!quota.allowed) {
        send(response, 429, {
          error: "daily limit reached",
          used: quota.used,
          limit: quota.limit,
          resetsAt: quota.resetsAt,
          hint:
            "This limit applies to analysis paid for by the app provider. " +
            "Configuring your own provider in the app removes it, because " +
            "nothing here is being spent.",
        });
        return;
      }

      // Per provider, never blanket. Anthropic needs workload federation;
      // Azure does not, and gating the default on the opt-in one made a
      // fully working EU path refuse every request because an unrelated
      // credential was missing.
      const selected = providers[provider];
      if (!selected) {
        send(response, 503, {
          error: `provider "${provider}" is not configured on this deployment`,
          available: Object.keys(providers),
          ...(provider === "anthropic" && federationMissing.length > 0
            ? { federationMissing }
            : {}),
        });
        return;
      }

      let reply;
      try {
        reply = await selected.analyse(values, question);
      } catch (error) {
        send(response, 502, {
          error: "provider call failed",
          provider: selected.name,
          detail:
            error instanceof Error ? error.message.slice(0, 300) : "unknown",
        });
        return;
      }

      send(response, 200, {
        text: reply.text,
        model: reply.model,
        provider: reply.provider,
        euResident: selected.euResident,
        quota: {
          used: quota.used,
          limit: quota.limit,
          resetsAt: quota.resetsAt,
        },
      });
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

/** Azure OpenAI is reached with the same managed identity, different audience. */
async function azureToken(): Promise<string> {
  const entra = entraConfigFromEnv({
    ...process.env,
    ANTHROPIC_WIF_AUDIENCE: "https://cognitiveservices.azure.com",
  });
  return fetchIdentityToken(entra);
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  const { config, missing } = federationConfigFromEnv();
  const providers: Partial<Record<ProviderName, Provider>> = {};

  // Azure is the default and the only provider-paid option that keeps special
  // category data inside the EU data zone. It is configured whenever an
  // endpoint exists, independently of whether Anthropic federation is set up.
  if (AZURE_ENDPOINT) {
    providers.azure = new AzureProvider(
      AZURE_DEPLOYMENT,
      AZURE_ENDPOINT,
      azureToken,
    );
  }

  let credentials: FederatedCredentials | undefined;
  if (config) {
    const entra = entraConfigFromEnv();
    credentials = new FederatedCredentials(
      () => fetchIdentityToken(entra),
      config,
    );
    const federated = credentials;
    providers.anthropic = new AnthropicProvider(ANTHROPIC_MODEL, () =>
      federated.get(),
    );
  }

  // MemoryQuotaStore is correct only at one replica and loses the count on
  // restart, so which store is in use is stated at startup rather than left to
  // be discovered when a limit turns out not to have held.
  const quotaStore = new MemoryQuotaStore();

  const port = Number(process.env.PORT ?? 8080);
  createApp(credentials, missing, providers, quotaStore).listen(port, () => {
    console.log(
      JSON.stringify({
        event: "listening",
        port,
        defaultProvider: providers.azure ? "azure" : "none",
        providers: Object.keys(providers),
        dailyLimit: DAILY_LIMIT,
        quotaStore: "memory (single replica only)",
        federationConfigured: credentials !== undefined,
        ...(missing.length > 0 ? { federationMissing: missing } : {}),
      }),
    );
  });
}
