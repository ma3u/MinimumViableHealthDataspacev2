"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Script from "next/script";
import { ArrowLeft, ExternalLink, Download, FileJson } from "lucide-react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const BASE_PATH = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
const OPENAPI_URL = `${BASE_PATH}/openapi.yaml`;
const SWAGGER_VERSION = "5.17.14";

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
    SwaggerUIStandalonePreset?: unknown;
  }
}

export default function ApiReferencePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const init = () => {
      if (initializedRef.current) return;
      if (!window.SwaggerUIBundle || !containerRef.current) return;
      initializedRef.current = true;
      window.SwaggerUIBundle({
        url: OPENAPI_URL,
        domNode: containerRef.current,
        deepLinking: true,
        presets: [window.SwaggerUIBundle, window.SwaggerUIStandalonePreset],
        layout: "BaseLayout",
        docExpansion: "list",
        filter: true,
        tryItOutEnabled: true,
        persistAuthorization: true,
      });
    };

    init();
    const interval = window.setInterval(init, 200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <link
        rel="stylesheet"
        href={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`}
      />
      <Script
        src={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`}
        strategy="afterInteractive"
      />
      <Script
        src={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-standalone-preset.js`}
        strategy="afterInteractive"
      />

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

        <div className="rounded-lg border border-[var(--border)] bg-white text-black overflow-hidden">
          <div ref={containerRef} id="swagger-ui" />
        </div>
      </div>
    </div>
  );
}
