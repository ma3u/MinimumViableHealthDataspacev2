"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import "@scalar/api-reference-react/style.css";
import { IS_STATIC } from "@/lib/static-export";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { ApiSignInGuide } from "@/components/docs/ApiSignInGuide";
import { useT } from "@/lib/i18n/translate";

const ApiReferenceReact = dynamic(
  () => import("@scalar/api-reference-react").then((m) => m.ApiReferenceReact),
  { ssr: false },
);

const SPEC_URL = IS_STATIC
  ? "/MinimumViableHealthDataspacev2/openapi.yaml"
  : "/openapi.yaml";

/**
 * The specifications the API implements, each linked to its version. Scalar's
 * metaData description below names them too, but that is a <meta> tag and
 * cannot carry links, so the page header shows them.
 */
const SPECS: { label: string; href: string }[] = [
  {
    label: "DSP 2025-1",
    href: "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
  },
  {
    label: "DCP v1.0",
    href: "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
  },
  { label: "FHIR R4", href: "https://hl7.org/fhir/R4/" },
  {
    label: "OMOP CDM v5.4",
    href: "https://ohdsi.github.io/CommonDataModel/cdm54.html",
  },
  {
    label: "HealthDCAT-AP Release 8",
    href: "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
  },
];

export default function ApiReferencePage() {
  // Scalar's "Test Request" and its curl samples use the first server of the
  // OpenAPI spec, the Azure demo, whichever hub serves the page. baseServerURL
  // does not change that: it only completes relative server URLs, and the
  // spec's are absolute (seen on 2026-11-11: a local stack's samples said
  // https://ehds.mabu.red). `servers` replaces the list, so the one server on
  // offer is the hub the reader is signed in to. The static export has no API
  // routes and keeps the spec's list.
  const t = useT("docsDeveloper");
  const [baseServerUrl, setBaseServerUrl] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseServerUrl(window.location.origin);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-4 border-b border-(--border) bg-(--surface-1)">
        <Link
          href="/docs/developer"
          className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary)"
        >
          <ArrowLeft size={14} /> {t("Back to Developer Guide")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("API Reference")}</h1>
        <DocsLastUpdated page="/docs/developer/reference" />
        <p className="text-sm text-(--text-secondary) mt-1">
          {t(
            "Interactive, three-column reference for all REST endpoints of the EHDS Integration Hub. Powered by Scalar: try any endpoint directly from the right-hand code panel.",
          )}
        </p>
        <p
          className="text-xs text-(--text-secondary) mt-1"
          data-testid="api-reference-specs"
        >
          {SPECS.map((spec, i) => (
            <span key={spec.href}>
              {i > 0 && " · "}
              <a
                href={spec.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--accent) hover:underline"
              >
                {spec.label}
              </a>
            </span>
          ))}
        </p>
        <div className="mt-3 max-w-5xl">
          <ApiSignInGuide returnTo="/docs/developer/reference" />
        </div>
      </div>
      <div className="flex-1 bg-white">
        <ApiReferenceReact
          configuration={{
            url: SPEC_URL,
            theme: "default",
            layout: "modern",
            hideDarkModeToggle: false,
            // "Open API Client" leaves for client.scalar.com, which cannot
            // send this hub's session cookie (every route but /api/health
            // needs one, ADR-044) and which some networks do not reach at
            // all. The in-page client already sends requests, signed in.
            hideClientButton: true,
            // "Ask AI" sends the question and the document to Scalar's
            // service, which this hub's Content-Security-Policy does not
            // allow (connect-src 'self') and a reader did not ask for.
            agent: { disabled: true },
            // The roles an operation's gate admits, beside the operation.
            showExtensions: ["x-required-roles"],
            ...(baseServerUrl ? { baseServerURL: baseServerUrl } : {}),
            ...(baseServerUrl && !IS_STATIC
              ? {
                  servers: [
                    {
                      url: baseServerUrl,
                      description: "This hub, where you are signed in",
                    },
                  ],
                }
              : {}),
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
