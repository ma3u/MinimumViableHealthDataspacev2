"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Download,
  FileJson,
  AlertCircle,
  Loader2,
} from "lucide-react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const BASE_PATH = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
const OPENAPI_URL = `${BASE_PATH}/openapi.yaml`;
const SWAGGER_CSS = `${BASE_PATH}/swagger-ui/swagger-ui.css`;
const SWAGGER_BUNDLE = `${BASE_PATH}/swagger-ui/swagger-ui-bundle.js`;
const SWAGGER_PRESET = `${BASE_PATH}/swagger-ui/swagger-ui-standalone-preset.js`;

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
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link
          href="/docs/developer#api-reference"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Developer Guide
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Interactive API Reference</h1>
          <p className="text-[var(--text-secondary)]">
            OpenAPI 3.1 specification for all 38 Next.js API routes (DSP 2025-1,
            DCP v1.0, FHIR R4, OMOP CDM, HealthDCAT-AP). Use{" "}
            <strong>Try it out</strong> to call live endpoints — most routes
            require a NextAuth session cookie.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 text-sm">
          <a
            href={OPENAPI_URL}
            download="mvhdv2-openapi.yaml"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download openapi.yaml
          </a>
          <Link
            href="/docs/developer#api-reference"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <FileJson className="w-4 h-4" />
            Route summary table
          </Link>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/bruno/MVHDv2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Bruno collection
          </a>
        </div>

        {status === "loading" && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-10 flex flex-col items-center gap-3 text-[var(--text-secondary)]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <div className="text-sm">
              Loading Swagger UI and fetching{" "}
              <code className="text-xs bg-[var(--surface-3)] px-1 py-0.5 rounded">
                {OPENAPI_URL}
              </code>
              …
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-sm">
            <div className="flex items-start gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-1">
                  Swagger UI failed to load
                </div>
                <div className="text-[var(--text-secondary)] mb-2">
                  {errorMsg}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Check your network connection or browser console, or download
                  the raw spec via the button above and open it in a local
                  Swagger Editor.
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
              ? "rounded-lg border border-[var(--border)] bg-white text-black overflow-hidden swagger-host"
              : "hidden"
          }
        />
      </div>
    </div>
  );
}
