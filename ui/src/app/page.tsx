import { BASE_PATH } from "@/lib/static-export";
import Link from "next/link";
import {
  BookOpen,
  ShieldCheck,
  Github,
  Heart,
  FlaskConical,
  Globe,
  Lock,
  Network,
  ExternalLink,
  MessageCircle,
  Code2,
  Boxes,
  KeyRound,
  Scale,
  Workflow,
} from "lucide-react";
import { DemoPersonaCards } from "@/components/DemoPersonaCards";
import { T } from "@/lib/i18n/translate";
import { PersonaJourneyCards } from "@/components/PersonaJourneyCards";
import { FeatureCardGrid } from "@/components/FeatureCardGrid";
import { HomeRegisterCta } from "@/components/HomeRegisterCta";
import { LivingBodyHero } from "@/components/LivingBodyHero";
import { LatestUpdates } from "@/components/LatestUpdates";
import { KlarbefundShowcase } from "@/components/KlarbefundShowcase";
import { JourneyFlows } from "@/components/JourneyFlows";

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-8 lg:gap-12 items-center"
        aria-labelledby="hero-title"
      >
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h1
              id="hero-title"
              className="text-2xl sm:text-3xl lg:text-4xl font-bold"
            >
              <T area="home">{"European Health Data Space"}</T>
            </h1>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2"
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--text-secondary) hover:text-(--text-primary) transition-colors touch-target-sm"
            >
              <span className="sr-only">
                <T area="home">{"View source on GitHub"}</T>
              </span>
              <Github size={24} aria-hidden="true" />
            </a>
          </div>

          <p className="text-(--text-primary) text-base sm:text-lg leading-relaxed max-w-3xl mb-4">
            <T
              area="home"
              tags={{
                b: <strong className="text-(--accent)" />,
                a: (
                  <a
                    href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-(--accent) transition-colors"
                  />
                ),
                s: <strong className="text-(--text-primary)" />,
              }}
            >
              {
                "This interactive demo is an <b>EHDS integration platform</b> you can run, fork, and wire into your own stack. It shows how the <a>EHDS regulation</a> enables secure cross-border health data sharing across Europe: publishing clinical datasets, negotiating access contracts under ODRL, and transferring FHIR / OMOP data through the <s>Dataspace Protocol</s>. Every flow is exposed as a REST API you can exercise from Swagger, Scalar, Bruno, or your own client."
              }
            </T>
          </p>

          <div className="flex flex-wrap gap-3 text-sm text-(--text-secondary)">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-(--surface-2)/60 border border-(--border)">
              <Heart
                size={14}
                className="text-green-800 dark:text-green-300"
                aria-hidden="true"
              />
              <span>
                <T area="home">{"127 synthetic patients"}</T>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-(--surface-2)/60 border border-(--border)">
              <Network
                size={14}
                className="text-blue-800 dark:text-blue-300"
                aria-hidden="true"
              />
              <span>
                <T area="home">{"5,300+ graph nodes"}</T>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-(--surface-2)/60 border border-(--border)">
              <Globe
                size={14}
                className="text-teal-800 dark:text-teal-300"
                aria-hidden="true"
              />
              <span>
                <T area="home">{"7 demo personas"}</T>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-(--surface-2)/60 border border-(--border)">
              <Lock
                size={14}
                className="text-purple-800 dark:text-purple-300"
                aria-hidden="true"
              />
              <span>
                <T area="home">{"All data is synthetic"}</T>
              </span>
            </span>
          </div>

          {/* ── Register with the EUDI Wallet (passwordless) ── */}
          <HomeRegisterCta />
        </div>

        {/* The living body: under the text on phones, so the heading and the
            sign-up stay at the top; moved left of it on wide screens. */}
        <LivingBodyHero className="aspect-9/16 w-[min(72vw,300px)] justify-self-center lg:order-first lg:w-auto lg:h-[min(72vh,620px)]" />
      </section>

      {/* ── The two journeys of the HL7 showcase deck, drawn and clickable ── */}
      <JourneyFlows />

      {/* ── Why EHDS Matters ─────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "150ms" }}
        aria-labelledby="why-ehds-title"
      >
        <h2 id="why-ehds-title" className="text-lg sm:text-xl font-bold mb-2">
          <T area="home">{"Why the European Health Data Space Matters"}</T>
        </h2>

        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-3xl mb-5">
          <T
            area="home"
            tags={{
              a: (
                <a
                  href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-(--accent) underline underline-offset-2 hover:text-(--text-primary) transition-colors"
                />
              ),
              b: <strong className="text-(--text-primary)" />,
            }}
          >
            {
              "The <a>EHDS regulation</a> creates a unified framework for sharing health data across EU member states while safeguarding patient rights under GDPR. It distinguishes between <b>primary use</b> (patients accessing their own records) and <b>secondary use</b> (research, policy, innovation), each with strict governance and oversight."
            }
          </T>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-(--role-user-border) bg-(--role-user-bg) p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical
                size={18}
                className="text-(--role-user-text)"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                <T area="home">{"For Researchers"}</T>
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-gray-800 dark:text-gray-200" />,
                }}
              >
                {
                  "Cross-border access to standardised health datasets in <b>FHIR R4</b> and <b>OMOP CDM</b> format, ending bilateral negotiations with each hospital. The health data access body decides on one application under Art. 67 and 68, cutting months of bureaucracy to weeks."
                }
              </T>
            </p>
          </div>

          <div className="rounded-xl border border-(--role-holder-border) bg-(--role-holder-bg) p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen
                size={18}
                className="text-(--role-holder-text)"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                <T area="home">{"For Hospitals"}</T>
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-gray-800 dark:text-gray-200" />,
                }}
              >
                {
                  "A clear legal basis for sharing data with researchers while staying GDPR-compliant. Publish datasets once via <b>HealthDCAT-AP</b> catalogues, manage access through standardised <b>DSP contracts</b>, and let the health data access body handle regulatory approval, reducing legal risk and administrative burden."
                }
              </T>
            </p>
          </div>

          <div className="rounded-xl border border-(--role-patient-border) bg-(--role-patient-bg) p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Heart
                size={18}
                className="text-(--role-patient-text)"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                <T area="home">{"For Patients"}</T>
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-gray-800 dark:text-gray-200" />,
                }}
              >
                {
                  "Full control over your health records across borders. Access your data from any EU provider via <b>EEHRxF</b> (European Electronic Health Record exchange Format), with <b>GDPR Art. 15-22</b> rights to access, rectify, and control how your data is used for research."
                }
              </T>
            </p>
          </div>

          <div className="rounded-xl border border-(--role-hdab-border) bg-(--role-hdab-bg) p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck
                size={18}
                className="text-(--role-hdab-text)"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                <T area="home">{"For Regulators"}</T>
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-gray-800 dark:text-gray-200" />,
                }}
              >
                {
                  "Issue and enforce EHDS data permits (Art. 68) as the <b>health data access body</b>. Audit compliance via <b>verifiable credentials</b>, ensure protocol conformance, and govern trust anchors across the dataspace."
                }
              </T>
            </p>
          </div>
        </div>
      </section>

      {/* ── Standards & Interoperability ──────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "180ms" }}
        aria-labelledby="standards-title"
      >
        <h2 id="standards-title" className="text-lg sm:text-xl font-bold mb-2">
          <T area="home">{"Standards & Interoperability"}</T>
        </h2>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-3xl mb-5">
          <T area="home">
            {
              "The EHDS builds on established open standards to ensure interoperability across all EU member states. This demo implements each standard end-to-end."
            }
          </T>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              name: "EHDS Regulation",
              abbr: "EHDS",
              desc: "EU regulation establishing rules for primary use (patient access) and secondary use (research) of electronic health data across member states.",
              href: "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en",
              color: "border-layer5/50 text-purple-800 dark:text-purple-300",
            },
            {
              name: "HL7 FHIR R4",
              abbr: "FHIR",
              desc: "Fast Healthcare Interoperability Resources, the global standard for exchanging clinical data (Patient, Condition, Observation, Medication).",
              href: "https://hl7.org/fhir/R4/",
              color: "border-layer3/50 text-green-800 dark:text-green-300",
            },
            {
              name: "OMOP Common Data Model",
              abbr: "OMOP",
              desc: "Observational Medical Outcomes Partnership CDM v5.4. Standardises clinical data for large-scale observational research and cohort analytics.",
              href: "https://ohdsi.github.io/CommonDataModel/",
              color: "border-layer4/50 text-amber-800 dark:text-amber-300",
            },
            {
              name: "HealthDCAT-AP",
              abbr: "DCAT",
              desc: "Health extension of DCAT-AP, a metadata standard for publishing and discovering health datasets in federated catalogues across the EU.",
              href: "https://healthdcat-ap.github.io/",
              color: "border-layer2/50 text-teal-800 dark:text-teal-300",
            },
            {
              name: "Dataspace Protocol",
              abbr: "DSP",
              desc: "Eclipse Dataspace Protocol 2025-1. Governs catalogue federation, contract negotiation, and secure data transfer between dataspace participants.",
              href: "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
              color: "border-layer1/50 text-blue-800 dark:text-blue-300",
            },
            {
              name: "Decentralised Claims Protocol",
              abbr: "DCP",
              desc: "Verifiable credential issuance and presentation. Enables trust anchors, membership credentials, and data access permits without central authority.",
              href: "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
              color: "border-purple-500/50 text-(--accent)",
            },
          ].map(({ name, abbr, desc, href, color }) => (
            <a
              key={abbr}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex flex-col rounded-xl border p-4 sm:p-5 transition-colors hover:bg-(--surface-2)/50 ${
                color.split(" ")[0]
              }`}
            >
              <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 mb-2">
                <T area="home">{name}</T>
              </span>
              <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                <T area="home">{desc}</T>
              </p>
              <ExternalLink
                size={14}
                className="mt-3 text-(--text-secondary) group-hover:text-(--text-secondary) transition-colors"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </section>

      {/* ── Learn by Doing: Dataspace & Data Mesh ───────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "190ms" }}
        aria-labelledby="learn-title"
      >
        <h2 id="learn-title" className="text-lg sm:text-xl font-bold mb-2">
          <T area="home">
            {"Learn the New Principles: Dataspaces & Data Mesh"}
          </T>
        </h2>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-3xl mb-5">
          <T
            area="home"
            tags={{
              b: <strong className="text-(--text-primary)" />,
              i: <em />,
            }}
          >
            {
              "Health data is no longer moved by point-to-point integrations. The EHDS is built on <b>dataspace</b> and <b>data mesh</b> principles: sovereign participants own their <i>data domains</i>, publish them as <i>data products</i>, and exchange them through open protocols instead of bulk copies. Use this demo to get hands-on with the four building blocks every implementer needs to understand."
            }
          </T>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-layer2/50 bg-(--surface-2)/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Boxes
                size={18}
                className="text-teal-800 dark:text-teal-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-(--text-primary) text-sm sm:text-base">
                <T area="home">{"Data Domains & Data Products"}</T>
              </h3>
            </div>
            <p className="text-sm text-(--text-secondary) leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-(--text-primary)" />,
                  i: <em />,
                }}
              >
                {
                  "Each hospital, registry, or research org is a domain that owns its data end-to-end. A <b>data product</b> packages a dataset with metadata (HealthDCAT-AP), contract terms (ODRL), and an access endpoint (FHIR / OMOP). Browse them in the catalogue to see what federated ownership actually looks like."
                }
              </T>
            </p>
            <Link
              href="/catalog"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-(--accent) hover:underline"
            >
              <T area="home">{"Explore the catalogue"}</T>{" "}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-layer1/50 bg-(--surface-2)/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Workflow
                size={18}
                className="text-blue-800 dark:text-blue-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-(--text-primary) text-sm sm:text-base">
                <T area="home">{"Dataspace Protocol (DSP): Exchange"}</T>
              </h3>
            </div>
            <p className="text-sm text-(--text-secondary) leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-(--text-primary)" />,
                  i: <em />,
                }}
              >
                {
                  "DSP 2025-1 standardises the four exchange phases, <i>catalogue → negotiation → agreement → transfer</i>, so any two participants can trade data without bilateral glue code. Walk through a full negotiation and watch the state transitions in the live graph."
                }
              </T>
            </p>
            <Link
              href="/negotiate"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-(--accent) hover:underline"
            >
              <T area="home">{"Run a DSP negotiation"}</T>{" "}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-purple-500/40 bg-(--surface-2)/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound
                size={18}
                className="text-purple-800 dark:text-purple-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-(--text-primary) text-sm sm:text-base">
                <T area="home">
                  {"W3C DID & Verifiable Credentials: Authentication"}
                </T>
              </h3>
            </div>
            <p className="text-sm text-(--text-secondary) leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-(--text-primary)" />,
                  i: <em />,
                }}
              >
                {
                  "Participants identify themselves with <b>did:web</b> identifiers and prove membership, health data access body approval, or researcher status with <b>W3C Verifiable Credentials</b> issued via the Decentralised Claims Protocol (DCP). No central identity broker: trust is federated and cryptographically verifiable."
                }
              </T>
            </p>
            <Link
              href="/credentials"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-(--accent) hover:underline"
            >
              <T area="home">{"Inspect credentials"}</T>{" "}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-layer4/50 bg-(--surface-2)/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Scale
                size={18}
                className="text-amber-800 dark:text-amber-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-(--text-primary) text-sm sm:text-base">
                <T area="home">{"W3C ODRL Policies: Authorization"}</T>
              </h3>
            </div>
            <p className="text-sm text-(--text-secondary) leading-relaxed">
              <T
                area="home"
                tags={{
                  b: <strong className="text-(--text-primary)" />,
                  i: <em />,
                }}
              >
                {
                  "Every data product is governed by a machine-readable <b>ODRL 2.2 policy</b> declaring permissions, prohibitions, and duties (purpose limits, retention, geographic scope, anonymisation). Policies travel with the contract and are enforced at the data plane, not as free-text T&Cs."
                }
              </T>
            </p>
            <Link
              href="/admin/policies"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-(--accent) hover:underline"
            >
              <T area="home">{"Edit ODRL policies"}</T>{" "}
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── REST API Integration Tools ──────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "200ms" }}
        aria-labelledby="integration-title"
      >
        <h2
          id="integration-title"
          className="text-lg sm:text-xl font-bold mb-2"
        >
          <T area="home">{"Integrate It: REST API Tools"}</T>
        </h2>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-3xl mb-5">
          <T
            area="home"
            tags={{
              b: <strong className="text-(--text-primary)" />,
              a: (
                <Link
                  href="/auth/signin?callbackUrl=%2Fdocs%2Fdeveloper%2Freference"
                  className="text-(--accent) underline"
                />
              ),
            }}
          >
            {
              "Every operation of the hub's API is documented in <b>OpenAPI 3.1</b> and can be tried from two interactive explorers, a Bruno collection, or any HTTP client. The API needs a session: <a>sign in</a> first, as <b>edcadmin</b> to start. Each explorer says which role opens which group of operations."
            }
          </T>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/docs/developer/reference"
            className="group flex flex-col rounded-xl border border-layer1/50 bg-(--surface-2)/40 p-4 sm:p-5 transition-colors hover:bg-(--surface-2)/70"
          >
            <div className="flex items-center gap-2 mb-2">
              <Code2
                size={18}
                className="text-blue-800 dark:text-blue-300"
                aria-hidden="true"
              />
              <span className="font-semibold text-sm text-(--text-primary)">
                <T area="home">{"Scalar Reference"}</T>
              </span>
            </div>
            <p className="flex-1 text-xs text-(--text-secondary) leading-relaxed">
              <T area="home">
                {
                  "Modern API reference with try-it-now requests, language samples, and schema navigation. Powered by Scalar."
                }
              </T>
            </p>
            <ExternalLink
              size={14}
              className="mt-3 text-(--text-secondary)"
              aria-hidden="true"
            />
          </Link>

          <Link
            href="/docs/developer/api"
            className="group flex flex-col rounded-xl border border-layer3/50 bg-(--surface-2)/40 p-4 sm:p-5 transition-colors hover:bg-(--surface-2)/70"
          >
            <div className="flex items-center gap-2 mb-2">
              <Code2
                size={18}
                className="text-green-800 dark:text-green-300"
                aria-hidden="true"
              />
              <span className="font-semibold text-sm text-(--text-primary)">
                <T area="home">{"Swagger UI"}</T>
              </span>
            </div>
            <p className="flex-1 text-xs text-(--text-secondary) leading-relaxed">
              <T area="home">
                {
                  "Classic OpenAPI explorer: try each operation against the hub you are signed in to, with your session."
                }
              </T>
            </p>
            <ExternalLink
              size={14}
              className="mt-3 text-(--text-secondary)"
              aria-hidden="true"
            />
          </Link>

          <a
            href={`${BASE_PATH}/openapi.yaml`}
            className="group flex flex-col rounded-xl border border-layer2/50 bg-(--surface-2)/40 p-4 sm:p-5 transition-colors hover:bg-(--surface-2)/70"
            download="mvhdv2-openapi.yaml"
          >
            <div className="flex items-center gap-2 mb-2">
              <BookOpen
                size={18}
                className="text-teal-800 dark:text-teal-300"
                aria-hidden="true"
              />
              <span className="font-semibold text-sm text-(--text-primary)">
                <T area="home">{"OpenAPI 3.1 Spec"}</T>
              </span>
            </div>
            <p className="flex-1 text-xs text-(--text-secondary) leading-relaxed">
              <T area="home">
                {
                  "Raw YAML spec for codegen, Postman import, or custom tooling. Source of truth for every route."
                }
              </T>
            </p>
            <ExternalLink
              size={14}
              className="mt-3 text-(--text-secondary)"
              aria-hidden="true"
            />
          </a>

          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/bruno/MVHDv2"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col rounded-xl border border-layer5/50 bg-(--surface-2)/40 p-4 sm:p-5 transition-colors hover:bg-(--surface-2)/70"
          >
            <div className="flex items-center gap-2 mb-2">
              <Github
                size={18}
                className="text-purple-800 dark:text-purple-300"
                aria-hidden="true"
              />
              <span className="font-semibold text-sm text-(--text-primary)">
                <T area="home">{"Bruno Collection"}</T>
              </span>
            </div>
            <p className="flex-1 text-xs text-(--text-secondary) leading-relaxed">
              <T area="home">
                {
                  "Requests in git, one folder per EHDS role, with a session per demo user. Clone the repo and run each role's journey against a local stack."
                }
              </T>
            </p>
            <ExternalLink
              size={14}
              className="mt-3 text-(--text-secondary)"
              aria-hidden="true"
            />
          </a>
        </div>
      </section>

      {/* ── The iPhone app: real data, held by the person ───────────────── */}
      <KlarbefundShowcase />

      {/* ── Persona Journeys ─────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "200ms" }}
        aria-labelledby="workflow-title"
      >
        <h2 id="workflow-title" className="text-lg sm:text-xl font-bold mb-2">
          <T area="home">{"How the EHDS Demo Works"}</T>
        </h2>
        <p className="text-(--text-secondary) text-sm mb-6 max-w-2xl">
          <T area="home">
            {
              "Sign in as one of the demo personas and follow their journey through the dataspace. Each role sees different pages, data, and actions, mirroring real EHDS workflows."
            }
          </T>
        </p>

        <PersonaJourneyCards />
      </section>

      {/* ── Feature sections ──────────────────────────────────────────────── */}
      <section aria-labelledby="explore-title">
        <h2
          id="explore-title"
          className="text-sm font-semibold text-(--text-secondary) uppercase tracking-wider mb-1"
        >
          <T area="home">{"Explore"}</T>
        </h2>
        <p className="text-xs text-(--text-secondary) mb-3 max-w-2xl">
          <T area="home">
            {
              "The persona overview, the HealthDCAT-AP dataset catalogue, FHIR patient journeys, OMOP analytics, EEHRxF profile coverage and natural language queries. On the live demo, each opens after you sign in."
            }
          </T>
        </p>
        <FeatureCardGrid section="explore" delay={1200} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="exchange-title">
        <h2
          id="exchange-title"
          className="text-sm font-semibold text-(--text-secondary) uppercase tracking-wider mb-1"
        >
          <T area="home">{"Exchange · Transfer · Negotiate"}</T>
        </h2>
        <p className="text-xs text-(--text-secondary) mb-3 max-w-2xl">
          <T area="home">
            {
              "The DSP data exchange lifecycle: hospitals publish datasets, researchers discover and request access, contracts are negotiated under ODRL policies, and approved FHIR/OMOP data is transferred securely."
            }
          </T>
        </p>
        <FeatureCardGrid section="exchange" delay={1400} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="govern-title">
        <h2
          id="govern-title"
          className="text-sm font-semibold text-(--text-secondary) uppercase tracking-wider mb-1"
        >
          <T area="home">{"Govern · Manage · Docs"}</T>
        </h2>
        <p className="text-xs text-(--text-secondary) mb-3 max-w-2xl">
          <T area="home">
            {
              "EHDS compliance monitoring, DCP verifiable credentials, participant onboarding with DID:web identities, portal administration, and architecture documentation."
            }
          </T>
        </p>
        <FeatureCardGrid section="govern" delay={1600} />
      </section>

      <div className="my-8 sm:my-10" />

      {/* ── Demo personas ─────────────────────────────────────────────────── */}
      <section aria-labelledby="personas-title">
        <DemoPersonaCards />
      </section>

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      <section
        className="mt-12 sm:mt-16 animate-fade-in-up"
        style={{ animationDelay: "1800ms" }}
        aria-labelledby="feedback-title"
      >
        <div className="rounded-xl border border-(--border) bg-(--surface)/60 p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <MessageCircle
              size={18}
              className="text-blue-800 dark:text-blue-300"
              aria-hidden="true"
            />
            <h2
              id="feedback-title"
              className="text-sm sm:text-base font-semibold text-(--text-primary)"
            >
              <T area="home">{"Feedback & Contributions"}</T>
            </h2>
          </div>
          <p className="text-sm text-(--text-secondary) mb-4 max-w-lg mx-auto">
            <T area="home">
              {
                "Found a bug, have a feature idea, or want to discuss the EHDS architecture? We'd love to hear from you."
              }
            </T>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-(--surface-2) text-(--text-primary) border border-(--border-ui) hover:border-layer1 hover:text-(--text-primary) transition-colors"
            >
              <Github size={16} aria-hidden="true" />
              <T area="home">{"Report an Issue"}</T>
            </a>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-(--surface-2) text-(--text-primary) border border-(--border-ui) hover:border-layer2 hover:text-(--text-primary) transition-colors"
            >
              <MessageCircle size={16} aria-hidden="true" />
              <T area="home">{"Join the Discussion"}</T>
            </a>
          </div>
        </div>
      </section>

      {/* ── Latest updates, the last section before the footer ──────────── */}
      <LatestUpdates />

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="mt-8 sm:mt-10 pt-6 border-t border-(--border) text-center text-xs text-(--text-secondary)">
        <p>
          <T area="home">
            {
              "Reference implementation. All data is synthetic. No real patient records."
            }
          </T>
        </p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">
          <a
            href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--text-secondary) transition-colors"
          >
            <T area="home">{"EHDS Chapters II and IV"}</T>
          </a>
          <span>·</span>
          <a
            href="https://hl7.org/fhir/R4/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--text-secondary) transition-colors"
          >
            FHIR R4
          </a>
          <span>·</span>
          <a
            href="https://ohdsi.github.io/CommonDataModel/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--text-secondary) transition-colors"
          >
            OMOP CDM v5.4
          </a>
          <span>·</span>
          <a
            href="https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--text-secondary) transition-colors"
          >
            DSP 2025-1
          </a>
          <span>·</span>
          <a
            href="https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--text-secondary) transition-colors"
          >
            DCP v1.0
          </a>
          <span>·</span>
          <span className="whitespace-nowrap">
            <T area="home">{"GDPR Art. 15-22"}</T>
          </span>
        </p>
      </footer>
    </div>
  );
}
