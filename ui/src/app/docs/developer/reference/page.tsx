"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "@scalar/api-reference-react/style.css";

const ApiReferenceReact = dynamic(
  () => import("@scalar/api-reference-react").then((m) => m.ApiReferenceReact),
  { ssr: false },
);

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const SPEC_URL = IS_STATIC
  ? "/MinimumViableHealthDataspacev2/openapi.yaml"
  : "/openapi.yaml";

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-1)]">
        <Link
          href="/docs/developer"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} /> Back to Developer Guide
        </Link>
        <h1 className="text-2xl font-bold mt-2">API Reference</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Interactive, three-column reference for all REST endpoints of the EHDS
          Integration Hub. Powered by Scalar — try any endpoint directly from
          the right-hand code panel.
        </p>
      </div>
      <div className="flex-1 bg-white">
        <ApiReferenceReact
          configuration={{
            url: SPEC_URL,
            theme: "default",
            layout: "modern",
            hideDarkModeToggle: false,
            hideClientButton: false,
            defaultHttpClient: {
              targetKey: "shell",
              clientKey: "curl",
            },
            metaData: {
              title: "EHDS Integration Hub API",
              description:
                "DSP 2025-1 · DCP v1.0 · FHIR R4 · OMOP CDM · HealthDCAT-AP",
            },
          }}
        />
      </div>
    </div>
  );
}
