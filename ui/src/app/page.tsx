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
} from "lucide-react";
import { DemoPersonaCards } from "@/components/DemoPersonaCards";
import { PersonaJourneyCards } from "@/components/PersonaJourneyCards";
import { FeatureCardGrid } from "@/components/FeatureCardGrid";

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        aria-labelledby="hero-title"
      >
        <div className="flex items-center gap-3 mb-3">
          <h1
            id="hero-title"
            className="text-2xl sm:text-3xl lg:text-4xl font-bold"
          >
            European Health Data Space
          </h1>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors touch-target-sm"
            aria-label="View source on GitHub"
          >
            <Github size={24} aria-hidden="true" />
          </a>
        </div>

        <p className="text-[var(--text-primary)] text-base sm:text-lg leading-relaxed max-w-3xl mb-4">
          This interactive demo shows how the{" "}
          <strong className="text-[var(--accent)]">EHDS regulation</strong>{" "}
          enables secure cross-border health data sharing across Europe. Explore
          the full lifecycle, from publishing clinical datasets to negotiating
          access contracts and running privacy-preserving analytics.
        </p>

        <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)]/60 border border-[var(--border)]">
            <Heart
              size={14}
              className="text-green-800 dark:text-green-300"
              aria-hidden="true"
            />
            <span>127 synthetic patients</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)]/60 border border-[var(--border)]">
            <Network
              size={14}
              className="text-blue-800 dark:text-blue-300"
              aria-hidden="true"
            />
            <span>5,300+ graph nodes</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)]/60 border border-[var(--border)]">
            <Globe
              size={14}
              className="text-teal-800 dark:text-teal-300"
              aria-hidden="true"
            />
            <span>7 demo personas</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)]/60 border border-[var(--border)]">
            <Lock
              size={14}
              className="text-purple-800 dark:text-purple-300"
              aria-hidden="true"
            />
            <span>All data is synthetic</span>
          </span>
        </div>
      </section>

      {/* ── Why EHDS Matters ─────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "150ms" }}
        aria-labelledby="why-ehds-title"
      >
        <h2 id="why-ehds-title" className="text-lg sm:text-xl font-bold mb-2">
          Why the European Health Data Space Matters
        </h2>

        <p className="text-[var(--text-secondary)] text-sm leading-relaxed max-w-3xl mb-5">
          The{" "}
          <a
            href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--text-primary)] transition-colors"
          >
            EHDS regulation
          </a>{" "}
          creates a unified framework for sharing health data across EU member
          states while safeguarding patient rights under GDPR. It distinguishes
          between{" "}
          <strong className="text-[var(--text-primary)]">primary use</strong>{" "}
          (patients accessing their own records) and{" "}
          <strong className="text-[var(--text-primary)]">secondary use</strong>{" "}
          (research, policy, innovation), each with strict governance and
          oversight.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--role-user-border)] bg-[var(--role-user-bg)] p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical
                size={18}
                className="text-[var(--role-user-text)]"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                For Researchers
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Cross-border access to standardised health datasets in{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                FHIR R4
              </strong>{" "}
              and{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                OMOP CDM
              </strong>{" "}
              format, ending bilateral negotiations with each hospital. The
              Health Data Access Body (HDAB) provides a single-window approval
              process under Art.&nbsp;46, cutting months of bureaucracy to
              weeks.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--role-holder-border)] bg-[var(--role-holder-bg)] p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen
                size={18}
                className="text-[var(--role-holder-text)]"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                For Hospitals
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              A clear legal basis for sharing data with researchers while
              staying GDPR-compliant. Publish datasets once via{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                HealthDCAT-AP
              </strong>{" "}
              catalogues, manage access through standardised{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                DSP contracts
              </strong>
              , and let the HDAB handle regulatory approval, reducing legal risk
              and administrative burden.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--role-patient-border)] bg-[var(--role-patient-bg)] p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Heart
                size={18}
                className="text-[var(--role-patient-text)]"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                For Patients
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Full control over your health records across borders. Access your
              data from any EU provider via{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                EEHRxF
              </strong>{" "}
              (European Electronic Health Record exchange Format), with{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                GDPR Art.&nbsp;15-22
              </strong>{" "}
              rights to access, rectify, and control how your data is used for
              research.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--role-hdab-border)] bg-[var(--role-hdab-bg)] p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck
                size={18}
                className="text-[var(--role-hdab-text)]"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                For Regulators
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Enforce EHDS Art.&nbsp;46-51 data access permits through the{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                Health Data Access Body
              </strong>
              . Audit compliance via{" "}
              <strong className="text-gray-800 dark:text-gray-200">
                verifiable credentials
              </strong>
              , ensure protocol conformance, and govern trust anchors across the
              dataspace.
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
          Standards & Interoperability
        </h2>
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed max-w-3xl mb-5">
          The EHDS builds on established open standards to ensure
          interoperability across all EU member states. This demo implements
          each standard end-to-end.
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
              desc: "IDSA Dataspace Protocol 2025-1. Governs catalogue federation, contract negotiation, and secure data transfer between dataspace participants.",
              href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol",
              color: "border-layer1/50 text-blue-800 dark:text-blue-300",
            },
            {
              name: "Decentralised Claims Protocol",
              abbr: "DCP",
              desc: "Verifiable credential issuance and presentation. Enables trust anchors, membership credentials, and data access permits without central authority.",
              href: "https://docs.internationaldataspaces.org/ids-knowledgebase/decentralized-claims-protocol",
              color: "border-purple-500/50 text-[var(--accent)]",
            },
          ].map(({ name, abbr, desc, href, color }) => (
            <a
              key={abbr}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group rounded-xl border p-4 sm:p-5 transition-colors hover:bg-[var(--surface-2)]/50 ${
                color.split(" ")[0]
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100`}
                >
                  {name}
                </span>
                <ExternalLink
                  size={14}
                  className="text-[var(--text-secondary)] group-hover:text-[var(--text-secondary)] transition-colors"
                  aria-hidden="true"
                />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {desc}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Persona Journeys ─────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "200ms" }}
        aria-labelledby="workflow-title"
      >
        <h2 id="workflow-title" className="text-lg sm:text-xl font-bold mb-2">
          How the EHDS Demo Works
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-6 max-w-2xl">
          Sign in as one of 5 personas and follow their journey through the
          dataspace. Each role sees different pages, data, and actions,
          mirroring real EHDS workflows.
        </p>

        <PersonaJourneyCards />
      </section>

      {/* ── Feature sections ──────────────────────────────────────────────── */}
      <section aria-labelledby="explore-title">
        <h2
          id="explore-title"
          className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1"
        >
          Explore
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3 max-w-2xl">
          Visualise the 5-layer knowledge graph, browse FHIR clinical data,
          query OMOP analytics, and search the HealthDCAT-AP dataset catalogue.
          All publicly accessible without sign-in.
        </p>
        <FeatureCardGrid section="explore" delay={1200} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="exchange-title">
        <h2
          id="exchange-title"
          className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1"
        >
          Exchange · Transfer · Negotiate
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3 max-w-2xl">
          The DSP data exchange lifecycle: hospitals publish datasets,
          researchers discover and request access, contracts are negotiated
          under ODRL policies, and approved FHIR/OMOP data is transferred
          securely.
        </p>
        <FeatureCardGrid section="exchange" delay={1400} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="govern-title">
        <h2
          id="govern-title"
          className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1"
        >
          Govern · Manage · Docs
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3 max-w-2xl">
          EHDS compliance monitoring, DCP verifiable credentials, participant
          onboarding with DID:web identities, portal administration, and
          architecture documentation.
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
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <MessageCircle
              size={18}
              className="text-blue-800 dark:text-blue-300"
              aria-hidden="true"
            />
            <h2
              id="feedback-title"
              className="text-sm sm:text-base font-semibold text-[var(--text-primary)]"
            >
              Feedback & Contributions
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-lg mx-auto">
            Found a bug, have a feature idea, or want to discuss the EHDS
            architecture? We&apos;d love to hear from you.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-ui)] hover:border-layer1 hover:text-[var(--text-primary)] transition-colors"
            >
              <Github size={16} aria-hidden="true" />
              Report an Issue
            </a>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-ui)] hover:border-layer2 hover:text-[var(--text-primary)] transition-colors"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Join the Discussion
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="mt-8 sm:mt-10 pt-6 border-t border-[var(--border)] text-center text-xs text-[var(--text-secondary)]">
        <p>
          Reference implementation. All data is synthetic. No real patient
          records.
        </p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">
          <a
            href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            EHDS Art.&nbsp;3-12, 46-51
          </a>
          <span>·</span>
          <a
            href="https://hl7.org/fhir/R4/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            FHIR R4
          </a>
          <span>·</span>
          <a
            href="https://ohdsi.github.io/CommonDataModel/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            OMOP CDM v5.4
          </a>
          <span>·</span>
          <a
            href="https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            DSP 2025-1
          </a>
          <span>·</span>
          <a
            href="https://docs.internationaldataspaces.org/ids-knowledgebase/decentralized-claims-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            DCP v1.0
          </a>
          <span>·</span>
          <span>GDPR Art.&nbsp;15-22</span>
        </p>
      </footer>
    </div>
  );
}
