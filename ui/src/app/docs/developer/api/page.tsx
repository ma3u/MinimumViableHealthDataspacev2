"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Download,
  FileJson,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { ApiSignInGuide } from "@/components/docs/ApiSignInGuide";
import { T, useT } from "@/lib/i18n/translate";
import { specForThisHub } from "@/lib/openapi-servers";
import facts from "@/app/docs/docs-facts.json";

const implementedOperations = facts.apiRoutes.reduce(
  (n, r) => n + r.methods.length,
  0,
);

const BASE_PATH = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
const OPENAPI_URL = `${BASE_PATH}/openapi.yaml`;
const SWAGGER_CSS = `${BASE_PATH}/swagger-ui/swagger-ui.css`;
const SWAGGER_BUNDLE = `${BASE_PATH}/swagger-ui/swagger-ui-bundle.js`;
const SWAGGER_PRESET = `${BASE_PATH}/swagger-ui/swagger-ui-standalone-preset.js`;

const REPO_BLOB =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/";
const OPENAPI_SPEC_URL = `https://spec.openapis.org/oas/v${facts.openapi.version}.html`;
const DSP_URL =
  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/";
const DCP_URL =
  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/";
const FHIR_URL = "https://hl7.org/fhir/R4/";
const OMOP_URL = "https://ohdsi.github.io/CommonDataModel/cdm54.html";
const HEALTHDCAT_URL =
  "https://data.health.europa.eu/healthdcat-ap/releases/release-8/";
/** The PR Gate's spec drift step. */
const SPEC_DRIFT_URL = `${REPO_BLOB}.github/workflows/pr-gate.yml#L72-L80`;
/** The launchers docker-compose.jad.yml builds: EDC 1.0 (ADR-076). */
const EDC_RUNTIMES_URL = `${REPO_BLOB}runtimes/edc/README.md`;

function Src({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-(--accent) hover:underline"
    >
      {children}
    </a>
  );
}

declare global {
  interface Window {
    SwaggerUIBundle?: ((config: Record<string, unknown>) => unknown) & {
      presets: { apis: unknown };
      SwaggerUIStandalonePreset?: unknown;
    };
    SwaggerUIStandalonePreset?: unknown;
  }
}

type Status = "loading" | "ready" | "error";

function loadCss(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${src}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error(`Failed to load ${src}`)),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export default function ApiReferencePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const t = useT("docsDeveloper");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        loadCss(SWAGGER_CSS);

        const specResponse = await fetch(OPENAPI_URL, { cache: "no-cache" });
        if (!specResponse.ok) {
          throw new Error(
            `Could not fetch ${OPENAPI_URL} (HTTP ${specResponse.status})`,
          );
        }
        await specResponse.text();

        await loadScript(SWAGGER_BUNDLE);
        await loadScript(SWAGGER_PRESET);

        if (cancelled) return;
        if (!window.SwaggerUIBundle || !containerRef.current) {
          throw new Error("Swagger UI bundle did not initialise");
        }

        window.SwaggerUIBundle({
          url: OPENAPI_URL,
          // "Try it out" goes to the first server of the spec, which is the
          // Azure demo. Put the hub this page is served from first, so the
          // request carries the reader's session (lib/openapi-servers.ts).
          // The static export has no API routes, so it keeps the spec's order.
          responseInterceptor: (res: {
            url?: string;
            text?: unknown;
            data?: unknown;
          }) => {
            if (
              !IS_STATIC &&
              typeof res.text === "string" &&
              res.url?.split("?")[0].endsWith("/openapi.yaml")
            ) {
              res.text = specForThisHub(res.text, window.location.origin);
              res.data = res.text;
            }
            return res;
          },
          domNode: containerRef.current,
          deepLinking: true,
          presets: [
            window.SwaggerUIBundle.presets.apis,
            window.SwaggerUIStandalonePreset,
          ],
          layout: "BaseLayout",
          docExpansion: "list",
          filter: true,
          tryItOutEnabled: true,
          persistAuthorization: true,
          // x-required-roles on an operation: the roles its gate admits.
          showExtensions: true,
        });

        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setErrorMsg(message);
        setStatus("error");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-(--background) text-(--text-primary)">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link
          href="/docs/developer#api-reference"
          className="inline-flex items-center gap-2 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("Back to Developer Guide")}
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">
            {t("Interactive API Reference")}
          </h1>
          <DocsLastUpdated page="/docs/developer/api" />
          <p className="text-(--text-secondary)">
            <T
              area="docsDeveloper"
              vars={{
                version: facts.openapi.version,
                documented: facts.openapi.operations,
                implemented: implementedOperations,
              }}
              tags={{
                oas: <Src href={OPENAPI_SPEC_URL} />,
                gate: <Src href={SPEC_DRIFT_URL} />,
              }}
            >
              {facts.openapi.operations >= implementedOperations
                ? "<oas>OpenAPI {version}</oas> specification of the hub's own API: all {implemented} operations the code implements are documented, and the <gate>PR Gate</gate> fails on a route that is not in the spec."
                : "<oas>OpenAPI {version}</oas> specification of the hub's own API: {documented} of the {implemented} operations the code implements are documented so far. The <gate>PR Gate</gate> fails on a new route that is not in the spec, and the backlog only shrinks."}
            </T>{" "}
            <T
              area="docsDeveloper"
              tags={{
                edc: <Src href={EDC_RUNTIMES_URL} />,
                dsp: <Src href={DSP_URL} />,
                dcp: <Src href={DCP_URL} />,
                fhir: <Src href={FHIR_URL} />,
                omop: <Src href={OMOP_URL} />,
                dcat: <Src href={HEALTHDCAT_URL} />,
                b: <strong />,
              }}
            >
              {
                "Behind it: <dsp>DSP 2025-1</dsp> and <dcp>DCP v1.0</dcp> on <edc>Eclipse EDC 1.0</edc>, <fhir>FHIR R4</fhir>, <omop>OMOP CDM v5.4</omop> and <dcat>HealthDCAT-AP Release 8</dcat>. <b>Try it out</b> calls the hub this page is served from."
              }
            </T>
          </p>
        </div>

        <div className="mb-6">
          <ApiSignInGuide returnTo="/docs/developer/api" />
        </div>

        <div className="flex flex-wrap gap-3 mb-6 text-sm">
          <a
            href={OPENAPI_URL}
            download="mvhdv2-openapi.yaml"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors"
          >
            <Download className="w-4 h-4" />
            {t("Download openapi.yaml")}
          </a>
          <Link
            href="/docs/developer#api-reference"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors"
          >
            <FileJson className="w-4 h-4" />
            {t("Route summary table")}
          </Link>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/bruno/MVHDv2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t("Bruno Collection")}
          </a>
        </div>

        {status === "loading" && (
          <div className="rounded-lg border border-(--border) bg-(--surface-2) p-10 flex flex-col items-center gap-3 text-(--text-secondary)">
            <Loader2 className="w-6 h-6 animate-spin" />
            <div className="text-sm">
              {t("Loading Swagger UI and the specification")}{" "}
              <code className="text-xs bg-(--surface-3) px-1 py-0.5 rounded-sm">
                {OPENAPI_URL}
              </code>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-sm">
            <div className="flex items-start gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold mb-1">
                  {t("Swagger UI failed to load")}
                </div>
                <div className="text-(--text-secondary) mb-2">{errorMsg}</div>
                <div className="text-xs text-(--text-secondary)">
                  {t(
                    "Check your network connection or the browser console, or download the specification with the button above and open it in a local Swagger Editor.",
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          id="swagger-ui"
          className={
            status === "ready"
              ? "rounded-lg border border-(--border) bg-white text-black overflow-hidden swagger-host"
              : "hidden"
          }
        />
      </div>
    </div>
  );
}
