"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Shield,
  AlertTriangle,
  Globe,
  Scale,
  Database,
  Search,
  BarChart3,
  MessageSquare,
  FileCheck,
  TestTube,
  Award,
  Share2,
  Compass,
  Handshake,
  ClipboardList,
  ArrowLeftRight,
  LayoutDashboard,
  Settings,
  Cpu,
  UserPlus,
  Users,
  BookOpen,
  PencilLine,
  ScrollText,
  Server,
  Smartphone,
  Wallet,
  Image as ImageIcon,
  X,
  Fingerprint,
} from "lucide-react";

const LIVE_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2";

/** The live hub's host, and a credential type: names, never translated
 *  (the French and Spanish texts write the Regulation EEDS, not EHDS). */
const LIVE_HOST = "ehds.mabu.red";
const PARTICIPANT_CREDENTIAL = "EHDSParticipantCredential";

const FULL_JOURNEY_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/FULL_USER_JOURNEY.md";
const SPE_RUNBOOK_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/knowledge/runbooks/spe-attestation-azure.md";
const ISSUE_774_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/774";

/** The sources the guide cites, each as deep as it goes: the article, the
 *  release tag, the file and line. */
const EHDS_URL = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
const GDPR_URL = "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng";
const EIDAS_URL = "https://eur-lex.europa.eu/eli/reg/2024/1183/oj/eng";
/** eIDAS Art. 8(2)(c), assurance level high (Regulation (EU) No 910/2014). */
const EIDAS_LEVEL_HIGH_URL =
  "https://eur-lex.europa.eu/eli/reg/2014/910/oj/eng#008.002";
const IMPL_2098_URL = "https://eur-lex.europa.eu/eli/reg_impl/2026/2098/oj/eng";
const REPO_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/";
const ISSUE_338_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338";
const DSP_URL =
  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/";
const DSP_TCK_URL =
  "https://github.com/eclipse-dataspacetck/dsp-tck/releases/tag/v1.0.2";
const DCP_URL =
  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/";
const DID_WEB_URL = "https://w3c-ccg.github.io/did-method-web/";
const OPENID4VP_URL =
  "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html";
const D_YOU_URL = "https://eudi-wallet.gov.de/";
const FHIR_URL = "https://hl7.org/fhir/R4/";
const FHIR_RESOURCES_URL = "https://hl7.org/fhir/R4/resourcelist.html";
const OMOP_URL = "https://ohdsi.github.io/CommonDataModel/cdm54.html";
const ODRL_URL = "https://www.w3.org/TR/odrl-model/#x2-odrl-information-model";
const DQV_URL = "https://www.w3.org/TR/vocab-dqv/";
const HEALTHDCAT_AP_URL =
  "https://data.health.europa.eu/healthdcat-ap/releases/release-8/";
const HEALTHDCAT_AP_LATEST_URL =
  "https://data.health.europa.eu/healthdcat-ap/releases/latest/";
const SNOMED_URL = "https://browser.ihtsdotools.org/";
const SNOMED_HYPERTENSION_URL =
  "https://browser.ihtsdotools.org/?perspective=full&conceptId1=38341003";
const ICD10_URL = "https://icd.who.int/browse10/2019/en";
const RXNORM_URL = "https://www.nlm.nih.gov/research/umls/rxnorm/index.html";
const LOINC_URL =
  "https://www.nlm.nih.gov/research/umls/sourcereleasedocs/current/LNC/index.html";
const CYPHER_URL = "https://neo4j.com/docs/cypher-manual/5/";
const NEO4J_URL = "https://neo4j.com/release-notes/database/neo4j-5-26-28/";
const KEYCLOAK_URL = "https://github.com/keycloak/keycloak/releases/tag/26.8.0";
const EDC_URL =
  "https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC5";
const IDENTITY_HUB_URL =
  "https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5";
const CFM_URL = "https://github.com/eclipse-cfm/cfm/releases/tag/v0.0.7";
const TRUSTEE_URL =
  "https://github.com/confidential-containers/trustee/releases/tag/v0.22.0";
const ACI_CONFIDENTIAL_URL =
  "https://learn.microsoft.com/en-us/azure/container-instances/container-instances-confidential-overview";
/** Microsoft: the CCE policy's SHA-256 is the report's HostData, enforced
 *  by the utility VM. */
const ACI_ATTESTATION_URL =
  "https://learn.microsoft.com/en-us/azure/container-instances/confidential-containers-attestation-concepts#full-attestation";
const APP_ATTEST_URL =
  "https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity";
const TESTFLIGHT_URL = "https://developer.apple.com/testflight/";

const LINK_CLASS =
  "text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline";

/** An external link inside a translated sentence; <T> fills in the words. */
const ext = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={LINK_CLASS}
  />
);
/** The same for a file name, set in the code font. */
const extCode = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`${LINK_CLASS} font-mono text-xs`}
  />
);
/** An article of Regulation (EU) 2025/327, or one of its paragraphs
 *  ("068.004" is Art. 68(4)). */
const art = (n: number) => ext(`${EHDS_URL}#art_${n}`);
const para = (id: string) => ext(`${EHDS_URL}#${id}`);
/** A file in this repository, at a line range where one says it. */
const repo = (path: string) => ext(`${REPO_URL}${path}`);

import MermaidDiagram from "@/components/MermaidDiagram";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { LocalizedImage } from "@/components/docs/LocalizedImage";
import { visibleNavGroups } from "@/components/Navigation";
import { guideScreenshotSrc } from "@/lib/guide-screenshots";
import { localizedChart } from "@/lib/i18n/diagrams";
import { T, useT } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";

/** The demo personas' realm roles (jad/keycloak-realm.json). `nav` labels
 *  are translated with the menu's words, the others in docsGuide. */
const MATRIX_PERSONAS = [
  {
    label: "Patient",
    roles: ["PATIENT"],
    className: "text-teal-700 dark:text-teal-400",
  },
  {
    label: "Data Holder",
    nav: true,
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    className: "text-(--accent)",
  },
  {
    label: "Researcher",
    nav: true,
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
    className: "text-(--success-text)",
  },
  {
    label: "HDAB",
    roles: ["HDAB_AUTHORITY"],
    className: "text-amber-700 dark:text-amber-400",
  },
  {
    label: "EDC Admin",
    roles: ["EDC_ADMIN"],
    className: "text-(--danger-text)",
  },
];

/** Every page in any persona's menu (the docs group aside), with who sees it. */
const MENU_MATRIX = (() => {
  const menus = MATRIX_PERSONAS.map(
    (p) =>
      new Set(
        visibleNavGroups(p.roles, true).flatMap((g) =>
          g.links.map((l) => l.href),
        ),
      ),
  );
  const rows = new Map<string, string>();
  for (const p of MATRIX_PERSONAS) {
    for (const g of visibleNavGroups(p.roles, true)) {
      if (g.label === "Docs") continue;
      for (const l of g.links) if (!rows.has(l.href)) rows.set(l.href, l.label);
    }
  }
  return [...rows].map(([href, label]) => ({
    href,
    label,
    seenBy: menus.map((m) => m.has(href)),
  }));
})();

/** Reusable card linking to a feature page */
/**
 * The page as its persona sees it on the static site
 * (src/lib/guide-screenshots.ts): small on mouse-over, full size in a native
 * modal <dialog> on a click or tap anywhere on the card's text, or on the
 * Screenshot button from the keyboard. Escape, the close button or a click
 * beside the image closes it.
 */
function ScreenshotDialog({
  src,
  title,
  href,
  dialogRef,
}: {
  src: string;
  title: string;
  href: string;
  dialogRef: React.RefObject<HTMLDialogElement>;
}) {
  const t = useT("docsGuide");
  const close = () => dialogRef.current?.close();
  return (
    <dialog
      ref={dialogRef}
      aria-label={t("Screenshot: {title}", { title })}
      onClick={(e) => {
        // The dialog itself is the backdrop area; its content stops here.
        if (e.target === e.currentTarget) close();
      }}
      onClose={() =>
        document.documentElement.classList.remove("overflow-hidden")
      }
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl overflow-visible bg-transparent p-0 opacity-0 scale-95 transition-[opacity,scale,display,overlay] duration-200 ease-out transition-discrete open:opacity-100 open:scale-100 starting:open:opacity-0 starting:open:scale-95 motion-reduce:transition-none backdrop:bg-black/0 backdrop:transition-[background-color,display,overlay] backdrop:duration-200 backdrop:transition-discrete open:backdrop:bg-black/75 starting:open:backdrop:bg-black/0"
    >
      <figure className="overflow-hidden rounded-xl border border-(--border) bg-(--surface) shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-(--border) px-4 py-2">
          <figcaption className="truncate text-sm font-semibold text-(--text-primary)">
            {title}
          </figcaption>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={href}
              onClick={close}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-400"
            >
              {t("Try it")} <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={close}
              data-close
              aria-label={t("Close screenshot")}
              className="inline-flex size-11 items-center justify-center rounded-lg text-(--text-secondary) hover:bg-(--surface-2)"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <LocalizedImage
          src={src}
          alt={t("Screenshot: {title}", { title })}
          loading="lazy"
          width={1200}
          height={750}
          className="block h-auto max-h-[calc(100dvh-5rem)] w-full object-contain"
        />
      </figure>
    </dialog>
  );
}

function FeatureCard({
  href,
  title,
  icon: Icon,
  requiresJAD,
  children,
}: {
  href: string;
  title: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  requiresJAD?: boolean;
  children: React.ReactNode;
}) {
  const t = useT("docsGuide");
  const isExternal = href.startsWith("http");
  const screenshot = guideScreenshotSrc(href);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openScreenshot = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    document.documentElement.classList.add("overflow-hidden");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    // The dialog would focus Try it, the first control; Escape or Close is
    // the likelier next step.
    dialog.querySelector<HTMLButtonElement>("button[data-close]")?.focus();
  };
  return (
    <div className="group relative border border-(--border) rounded-xl hover:border-indigo-500/50 focus-within:border-indigo-500/50 transition-colors">
      {screenshot && (
        <>
          {/* Small preview on mouse-over; Tailwind 4 applies group-hover
              only where a pointer can hover, so a tap never shows it. */}
          <figure
            aria-hidden="true"
            className="pointer-events-none invisible absolute right-4 top-full z-30 -mt-3 w-[min(22rem,calc(100%-2rem))] translate-y-1 overflow-hidden rounded-lg border border-(--border) bg-(--surface) opacity-0 shadow-2xl transition duration-150 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-200 motion-reduce:transition-none group-has-[dialog[open]]:hidden"
          >
            <LocalizedImage
              src={screenshot}
              alt=""
              loading="lazy"
              width={1200}
              height={750}
              className="block h-auto w-full"
            />
            <figcaption className="px-3 py-1.5 text-[11px] text-(--text-secondary)">
              {t("Click to enlarge")}
            </figcaption>
          </figure>
          <ScreenshotDialog
            src={screenshot}
            title={title}
            href={href}
            dialogRef={dialogRef}
          />
        </>
      )}
      <div
        className={`p-5 ${screenshot ? "cursor-zoom-in" : ""}`}
        onClick={(e) => {
          if (!screenshot) return;
          // A link or button in the card does its own thing.
          if ((e.target as HTMLElement).closest("a, button")) return;
          openScreenshot();
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Icon
                size={18}
                className="text-indigo-700 dark:text-indigo-400"
              />
            </div>
            <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400">
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {requiresJAD && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/30 font-medium">
                {t("JAD Stack")}
              </span>
            )}
            {screenshot && (
              <button
                type="button"
                onClick={openScreenshot}
                aria-haspopup="dialog"
                aria-label={t("Show screenshot: {title}", { title })}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-(--text-secondary) hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                <ImageIcon size={14} />
                <span className="hidden sm:inline">{t("Screenshot")}</span>
              </button>
            )}
            {isExternal ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-(--text-secondary) hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                {t("Open")} <ExternalLink size={12} />
              </a>
            ) : (
              <Link
                href={href}
                className="inline-flex items-center gap-1 text-xs text-(--text-secondary) hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                {t("Try it")} <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Table of Contents section IDs */
/** Table of Contents section IDs; `nav` labels are the menu's own words. */
const TOC_SECTIONS = [
  { id: "purpose", label: "Purpose" },
  { id: "personas", label: "Personas & Roles" },
  { id: "getting-started", label: "Getting Started" },
  { id: "availability", label: "When Is the Live Demo Available?" },
  { id: "explore", label: "Explore", nav: true },
  { id: "governance", label: "Governance", nav: true },
  { id: "data-exchange", label: "Data Exchange" },
  { id: "admin", label: "Administration" },
  { id: "help", label: "Need Help?" },
] as const;

/** A link that opens in a new tab with the external-link icon after its text. */
function ExternalTextLink({
  href,
  children,
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
    >
      {children}
      <ExternalLink size={12} />
    </a>
  );
}

export default function UserGuidePage() {
  const lang = useLanguage();
  const t = useT("docsGuide");
  const tn = useT("nav");
  const tc = useT("common");
  const te = useT("explore");

  // The marked parts of a translated text (<T tags>), made once here.
  const liveLink = (
    <a
      href={LIVE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    />
  );
  const liveLinkPlain = (
    <a
      href={LIVE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    />
  );
  const journeyLink = <ExternalTextLink href={FULL_JOURNEY_URL} />;
  const devGuideLink = <Link href="/docs/developer" className={LINK_CLASS} />;
  const archLink = <Link href="/docs/architecture" className={LINK_CLASS} />;
  const availabilityLink = <a href="#availability" className="underline" />;
  const strong = <strong />;
  const strongPrimary = <strong className="text-(--text-primary)" />;
  const code = <code />;
  const codeXs = <code className="text-xs" />;
  const signinCode = (
    <code className="text-xs bg-(--surface-2) px-1 py-0.5 rounded-sm" />
  );
  const attestationLink = (
    <Link
      href="/admin/attestation"
      className="text-indigo-700 dark:text-indigo-400 hover:underline"
    />
  );
  const auditLink = (
    <Link
      href="/admin/audit"
      className="text-indigo-700 dark:text-indigo-400 hover:underline"
    />
  );
  const issue774Link = <ExternalTextLink href={ISSUE_774_URL} />;
  const speRunbookLink = <ExternalTextLink href={SPE_RUNBOOK_URL} />;
  const l1 = <strong className="text-(--accent)" />;
  const l2 = <strong className="text-emerald-700 dark:text-teal-300" />;
  const l3 = <strong className="text-green-700 dark:text-green-300" />;
  const l4 = <strong className="text-orange-700 dark:text-orange-400" />;
  const l5 = <strong className="text-purple-700 dark:text-purple-400" />;
  const adr068Link = (
    <a
      href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md"
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-700 dark:text-indigo-400 hover:underline"
    />
  );
  const speDocLink = (
    <Link
      href="/docs/developer/secure-processing-environment"
      className="text-indigo-700 dark:text-indigo-400 hover:underline"
    />
  );
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> {t("Back to Docs")}
      </Link>
      <h1 className="text-3xl font-bold mb-2">{tn("User Guide")}</h1>
      <DocsLastUpdated page="/docs/user-guide" />
      <p className="text-(--text-secondary) mb-4">
        <T area="docsGuide" tags={{ a: liveLink, j: journeyLink }}>
          {
            "A practical guide for business users, researchers, and data stewards working with the Health Dataspace platform. Each section links directly to the feature page in the <a>live demo</a>. For a complete end-to-end walkthrough covering every persona and workflow, see the <j>Full User Journey</j>."
          }
        </T>
      </p>

      {/* ── Table of Contents ── */}
      <nav className="mb-10 border border-(--border) rounded-xl p-5 bg-(--surface-2)/30">
        <h2 className="text-sm font-semibold text-(--text-primary) mb-3 flex items-center gap-2">
          <BookOpen
            size={16}
            className="text-indigo-700 dark:text-indigo-400"
          />
          {t("Table of Contents")}
        </h2>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
          {TOC_SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-(--text-secondary) hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                <span className="font-mono text-xs text-(--text-secondary) mr-1">
                  {i + 1}.
                </span>
                {"nav" in s ? tn(s.label) : t(s.label)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Dynamic Feature Notice ── */}
      <div className="mb-10 border border-amber-500/30 bg-amber-500/5 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={20}
            className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
          />
          <div>
            <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
              {t("Static Demo vs Full Stack")}
            </h3>
            <p className="text-(--text-secondary) text-sm mb-3">
              <T
                area="docsGuide"
                tags={{ a: liveLinkPlain, c: code, h: availabilityLink }}
                vars={{ host: LIVE_HOST }}
              >
                {
                  "The <a>GitHub Pages demo</a> runs as a static export with mock data. The Azure EHDS Portal at <c>{host}</c> runs the full stack with live services, on weekdays in office hours (see <h>When Is the Live Demo Available?</h>). The following features require the full stack:"
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm space-y-1 ml-4 list-disc">
              <li>
                <T area="docsGuide" tags={{ b: strong, k: ext(KEYCLOAK_URL) }}>
                  {
                    "<b>Single sign-on</b> through <k>Keycloak</k>: the static demo uses a persona switcher instead"
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ b: strong, n: ext(NEO4J_URL) }}>
                  {
                    "<b>Live graph queries</b> on <n>Neo4j</n>: the persona overview and the other views read pre-loaded mock data"
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ b: strong, e: ext(EDC_URL) }}>
                  {
                    "<b>Contract negotiation & transfers</b>: require <e>EDC connectors</e>"
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ b: strong }}>
                  {
                    "<b>Natural language / federated queries</b>: require neo4j-proxy service"
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ b: strong }}>
                  {
                    "<b>ODRL policy enforcement</b>: requires live dataspace middleware"
                  }
                </T>
              </li>
            </ul>
            <p className="text-(--text-secondary) text-xs mt-3">
              <T area="docsGuide" tags={{ l: devGuideLink }}>
                {
                  "See the <l>Developer Guide</l> for full stack setup instructions."
                }
              </T>
            </p>
          </div>
        </div>
      </div>

      {/* ── 0. Purpose ── */}
      <section className="mb-12" id="purpose">
        <h2 className="text-2xl font-semibold mb-3">{t("Purpose")}</h2>
        <div className="border border-(--border) rounded-xl p-5 bg-(--surface-2)/20">
          <p className="text-(--text-secondary) text-sm mb-3">
            <T
              area="docsGuide"
              tags={{
                b: strongPrimary,
                r: ext(EHDS_URL),
                d: ext(DSP_URL),
                f: ext(FHIR_URL),
                o: ext(OMOP_URL),
                n: ext(NEO4J_URL),
              }}
            >
              {
                "This platform is a <b>reference implementation</b> of the European Health Data Space (EHDS) regulation, <r>Regulation (EU) 2025/327</r>. Its purpose is to demonstrate how sovereign health data exchange works in practice, combining the Dataspace Protocol (<d>DSP 2025-1</d>), <f>FHIR R4</f> clinical resources, <o>OMOP CDM</o> analytics, and biomedical ontologies into a unified <n>Neo4j</n> knowledge graph."
              }
            </T>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label: t("Synthetic patients"), value: "127" },
              { label: t("Graph nodes"), value: "5,300+" },
              { label: t("Architecture layers"), value: "5" },
              { label: t("Fictional organisations"), value: "5" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-(--border) rounded-lg p-3 text-center"
              >
                <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400">
                  {stat.value}
                </div>
                <div className="text-xs text-(--text-secondary)">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
          <p className="text-(--text-secondary) text-sm mb-2">
            {t(
              "The five knowledge-graph layers model the complete EHDS data lifecycle:",
            )}
          </p>
          <ol className="text-(--text-secondary) text-sm space-y-1 ml-4 list-decimal">
            <li>
              <T area="docsGuide" tags={{ b: l1, o: ext(ODRL_URL) }}>
                {
                  "<b>L1 Dataspace Marketplace</b>: Participants, DataProducts, <o>ODRL policies</o>, contracts, HDAB approvals"
                }
              </T>
            </li>
            <li>
              <T area="docsGuide" tags={{ b: l2, h: ext(HEALTHDCAT_AP_URL) }}>
                {
                  "<b>L2 HealthDCAT-AP Metadata</b>: Catalogues, datasets, distributions, data services, as <h>HealthDCAT-AP Release 8</h> describes them"
                }
              </T>
            </li>
            <li>
              <T area="docsGuide" tags={{ b: l3, f: ext(FHIR_RESOURCES_URL) }}>
                {
                  "<b>L3 FHIR R4 Clinical</b>: Patients, encounters, conditions, observations, medications, as <f>FHIR R4 resources</f>"
                }
              </T>
            </li>
            <li>
              <T area="docsGuide" tags={{ b: l4, o: ext(OMOP_URL) }}>
                {
                  "<b>L4 OMOP CDM Analytics</b>: Persons, condition occurrences, drug exposures, measurements, in <o>OMOP CDM v5.4</o> tables"
                }
              </T>
            </li>
            <li>
              <T
                area="docsGuide"
                tags={{
                  b: l5,
                  s: ext(SNOMED_URL),
                  i: ext(ICD10_URL),
                  r: ext(RXNORM_URL),
                  l: ext(LOINC_URL),
                }}
              >
                {
                  "<b>L5 Biomedical Ontology</b>: <s>SNOMED CT</s>, <i>ICD-10</i>, <r>RxNorm</r>, <l>LOINC</l> concept mappings"
                }
              </T>
            </li>
          </ol>
          <p className="text-(--text-secondary) text-xs mt-3">
            {t(
              "All data is fully synthetic. Organisation names are fictional (AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre, Institut de Recherche Santé).",
            )}
          </p>
        </div>
      </section>

      {/* ── 1. Personas & Roles ── */}
      <section className="mb-12" id="personas">
        <h2 className="text-2xl font-semibold mb-3">
          {t("Personas & Roles: Who Uses What?")}
        </h2>
        <p className="text-(--text-secondary) text-sm mb-4">
          <T area="docsGuide" tags={{ c: signinCode, e: para("002.002") }}>
            {
              "The EHDS regulation defines distinct participant roles (<e>Art. 2(2)</e>) to ensure accountability, data sovereignty, and patient rights across the health data ecosystem. This platform adapts its navigation, persona overview, and available actions to the signed-in user's EHDS role. Sign in at <c>/auth/signin</c> with any demo account: password equals username in local dev."
            }
          </T>
        </p>

        <FeatureCard
          href="/auth/signin"
          title={t("Sign In: Demo Persona Cards")}
          icon={Users}
        >
          <p className="text-(--text-secondary) text-sm mb-3">
            {t(
              "The sign-in page lists every demo account with its role badge and organisation. Clicking a card signs in through Keycloak SSO and opens the persona overview with the tab for that role.",
            )}
          </p>

          {/* Demo users table with EHDS regulatory context */}
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-(--border) text-(--text-secondary)">
                  <th className="text-left py-1.5 pr-3">{t("Username")}</th>
                  <th className="text-left py-1.5 pr-3">{t("Organisation")}</th>
                  <th className="text-left py-1.5 pr-3">{t("Role")}</th>
                  <th className="text-left py-1.5 pr-3">{t("Overview tab")}</th>
                  <th className="text-left py-1.5 pr-3">
                    {t("Primary question")}
                  </th>
                  <th className="text-left py-1.5">{t("EHDS basis")}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    user: "edcadmin",
                    org: t("Dataspace Operator"),
                    role: t("EDC Admin"),
                    color: "text-(--danger-text)",
                    graph: te("Access body"),
                    q: t("Who are my participants? What contracts are active?"),
                    ehds: t(
                      "No EHDS article defines this role: it runs the dataspace infrastructure and ensures interoperability between participants",
                    ),
                  },
                  {
                    user: "clinicuser",
                    org: "AlphaKlinik Berlin",
                    role: tc("Data Holder"),
                    color: "text-(--accent)",
                    graph: te("Data holder"),
                    q: t("Who has approved access to my datasets?"),
                    ehds: (
                      <T area="docsGuide" tags={{ a: art(60) }}>
                        {
                          "<a>EHDS Art. 60</a>: health data holders must make electronic health data available for secondary use when authorized"
                        }
                      </T>
                    ),
                  },
                  {
                    user: "lmcuser",
                    org: "Limburg Medical Centre",
                    role: tc("Data Holder"),
                    color: "text-(--accent)",
                    graph: te("Data holder"),
                    q: t("What contracts are active for my NL datasets?"),
                    ehds: (
                      <T area="docsGuide" tags={{ a: art(60) }}>
                        {
                          "<a>EHDS Art. 60</a>: cross-border data holder demonstrating multi-country interoperability"
                        }
                      </T>
                    ),
                  },
                  {
                    user: "researcher",
                    org: "PharmaCo Research AG",
                    role: tc("Researcher"),
                    color: "text-(--success-text)",
                    graph: te("Researcher"),
                    q: t("What datasets match my study protocol?"),
                    ehds: (
                      <T area="docsGuide" tags={{ a: para("053.001") }}>
                        {
                          "<a>EHDS Art. 53(1)</a>: data users access health data for permitted secondary use purposes (research, innovation, public health)"
                        }
                      </T>
                    ),
                  },
                  {
                    user: "regulator",
                    org: "MedReg DE",
                    role: tc("HDAB Authority"),
                    color: "text-amber-700 dark:text-amber-400",
                    graph: te("Access body"),
                    q: t("What approvals are pending? Is the chain complete?"),
                    ehds: (
                      <T area="docsGuide" tags={{ a: art(55), b: art(57) }}>
                        {
                          "EHDS <a>Art. 55</a> and <b>57</b>: Health Data Access Bodies are designated by each Member State to authorize secondary use of health data"
                        }
                      </T>
                    ),
                  },
                ].map((p) => (
                  <tr key={p.user} className="border-b border-(--border)">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-(--text-primary)">
                      {p.user}
                    </td>
                    <td className="py-1.5 pr-3 text-(--text-secondary)">
                      {p.org}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`inline-flex items-center gap-1 ${p.color} font-medium`}
                      >
                        <Shield size={10} />
                        {p.role}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-(--text-secondary)">
                      {p.graph}
                    </td>
                    <td className="py-1.5 pr-3 text-(--text-secondary) italic">
                      {p.q}
                    </td>
                    <td className="py-1.5 text-(--text-secondary)">{p.ehds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FeatureCard>

        {/* EHDS role background */}
        <div className="mt-6 border border-(--border) rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
            {t("Why These Roles? EHDS Regulatory Background")}
          </h3>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The European Health Data Space regulation establishes a governance framework for both primary use (patient access to their own data) and secondary use (research, innovation, policy-making). Each role in this platform maps to a specific actor defined in the regulation:",
            )}
          </p>
          <div className="space-y-3">
            {[
              {
                id: "holder",
                role: tc("Data Holder"),
                color: "text-(--accent)",
                article: (
                  <a
                    href={`${EHDS_URL}#art_60`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK_CLASS}
                  >
                    {t("Art. 60")}
                  </a>
                ),
                why: (
                  <T area="docsGuide" tags={{ o: ext(ODRL_URL) }}>
                    {
                      "Healthcare providers, insurers, and registries that hold electronic health data are legally required to make it available for authorized secondary use. They retain sovereignty over their data and control access through <o>ODRL policies</o> and contract negotiation."
                    }
                  </T>
                ),
              },
              {
                id: "user",
                role: t("Data User (Researcher)"),
                color: "text-(--success-text)",
                article: (
                  <T
                    area="docsGuide"
                    tags={{ a: para("053.001"), b: art(67), c: art(68) }}
                  >
                    {"<a>Art. 53(1)</a>, <b>Art. 67</b>, <c>Art. 68</c>"}
                  </T>
                ),
                why: (
                  <T area="docsGuide" tags={{ s: art(73) }}>
                    {
                      "Researchers, public health agencies, and innovators who need health data for permitted purposes must apply through an HDAB, receive a data permit, and access data only in a secure processing environment (<s>Art. 73</s>). They never receive raw patient data directly."
                    }
                  </T>
                ),
              },
              {
                id: "hdab",
                role: tc("HDAB Authority"),
                color: "text-amber-700 dark:text-amber-400",
                article: (
                  <T area="docsGuide" tags={{ a: art(55), b: art(57) }}>
                    {"<a>Art. 55</a>, <b>57</b>"}
                  </T>
                ),
                why: t(
                  "Each EU Member State must designate one or more Health Data Access Bodies (HDABs) as the national authority that reviews data access applications, issues data permits, and ensures compliance. MedReg DE represents the German HDAB in this implementation.",
                ),
              },
              {
                id: "operator",
                role: t("EDC Admin / Dataspace Operator"),
                color: "text-(--danger-text)",
                article: t("Not in the Regulation"),
                why: (
                  <T area="docsGuide" tags={{ a: para("075.008") }}>
                    {
                      "The dataspace operator runs the technical infrastructure: participant onboarding, connector management, federated catalog, and transfer monitoring. They ensure interoperability across all participants but do not access health data directly. No article of the Regulation defines this role; the nearest is the Commission, which operates the central platform of HealthData@EU (<a>Art. 75(8)</a>)."
                    }
                  </T>
                ),
              },
              {
                id: "trust-center",
                role: t("Trust Center Operator"),
                color: "text-violet-700 dark:text-violet-400",
                article: (
                  <T
                    area="docsGuide"
                    tags={{ a: para("066.003"), b: para("073.001") }}
                  >
                    {"<a>Art. 66(3)</a>, <b>Art. 73(1)(e)</b>"}
                  </T>
                ),
                why: (
                  <T
                    area="docsGuide"
                    tags={{ a: para("066.003"), b: para("073.001") }}
                  >
                    {
                      "The EHDS gives data users pseudonymised data only where anonymised data cannot serve the purpose, and keeps the information to reverse the pseudonymisation with the access body or a trusted third party (<a>Art. 66(3)</a>). The secure processing environment keeps identifiable logs of access for at least a year (<b>Art. 73(1)(e)</b>). The Trust Center manages pseudonym resolution and secure processing environment (SPE) sessions, and ensures that data users only access de-identified data."
                    }
                  </T>
                ),
              },
            ].map((r) => (
              <div
                key={r.id}
                className="border border-(--border) rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-semibold text-sm ${r.color}`}>
                    {r.role}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                    {r.article}
                  </span>
                </div>
                <p className="text-(--text-secondary) text-xs">{r.why}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Menu items per role */}
        <div className="mt-6 border border-(--border) rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
            {t("Menu Items per Role")}
          </h3>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "Navigation is filtered by role: items not relevant to a user's function are hidden entirely. This separation of concerns reflects the EHDS principle that each actor should only see the tools and data relevant to their regulatory function.",
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-(--border)">
                  <th className="text-left py-1.5 pr-2">{t("Page")}</th>
                  {MATRIX_PERSONAS.map((p) => (
                    <th key={p.label} className="text-center py-1.5 px-2">
                      <span className={p.className}>
                        {p.nav ? tn(p.label) : t(p.label)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MENU_MATRIX.map(({ href, label, seenBy }) => (
                  <tr key={href} className="border-b border-(--border)/50">
                    <td className="py-1.5 pr-2">
                      <span className="text-(--text-primary)">{tn(label)}</span>{" "}
                      <code className="text-(--text-secondary)">{href}</code>
                    </td>
                    {seenBy.map((seen, i) => (
                      <td
                        key={MATRIX_PERSONAS[i].label}
                        className="text-center py-1.5 px-2"
                        aria-label={
                          seen ? t("in the menu") : t("not in the menu")
                        }
                      >
                        {seen ? "\u2705" : "\u2014"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-(--text-secondary) text-xs mt-3">
            <T
              area="docsGuide"
              tags={{
                a: repo(
                  "docs/ADRs/ADR-044-every-api-route-needs-a-session.md?plain=1#L27-L45",
                ),
              }}
            >
              {
                "Generated from the navigation itself, so it shows exactly what each persona's menu holds. Every page except the start page and this documentation needs a sign-in (<a>ADR-044</a>); a page missing from a menu is not necessarily forbidden, the middleware decides that."
              }
            </T>
          </p>
        </div>

        {/* Persona overview views (the graph explorer is retired) */}
        <div className="mt-6 border border-(--border) rounded-xl p-5">
          <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
            {t("Persona Overview: one view per role")}
          </h3>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The persona overview answers each role's primary question in a single layered view: what is wrong right now, with the article it breaks, and the nodes behind it. It replaces the graph explorer, which is retired. Pick a role with the tabs at the top of the page or straight from here.",
            )}
          </p>
          <div className="space-y-3">
            {[
              {
                id: "patient",
                label: te("Patient"),
                title: te("My health, in one view"),
                color: "text-teal-700 dark:text-teal-400",
                q: te(
                  "Which parameters put me at risk, what should I do about them, and who is using my data?",
                ),
                articles: (
                  <T
                    area="docsGuide"
                    tags={{
                      r: ext(EHDS_URL),
                      a: art(3),
                      b: art(8),
                      c: art(14),
                      d: art(71),
                      e: art(73),
                    }}
                  >
                    {
                      "<r>Regulation (EU) 2025/327</r> Art. <a>3</a>, <b>8</b>, <c>14</c>, <d>71</d>, <e>73</e>"
                    }
                  </T>
                ),
              },
              {
                id: "researcher",
                label: te("Researcher / Data User"),
                title: te("My research, in one view"),
                color: "text-(--success-text)",
                q: te(
                  "What am I allowed to use today, what is pending or blocked, and what am I missing?",
                ),
                articles: (
                  <T
                    area="docsGuide"
                    tags={{
                      r: ext(EHDS_URL),
                      a: art(53),
                      b: art(61),
                      c: art(67),
                      d: art(68),
                      e: art(69),
                      f: art(73),
                    }}
                  >
                    {
                      "<r>Regulation (EU) 2025/327</r> Art. <a>53</a>, <b>61</b>, <c>67</c>, <d>68</d>, <e>69</e>, <f>73</f>"
                    }
                  </T>
                ),
              },
              {
                id: "hdab",
                label: t("Health Data Access Body"),
                title: te("Compliance, in one view"),
                color: "text-amber-700 dark:text-amber-400",
                q: te(
                  "Which operations are non-compliant right now, and are my own decisions on time?",
                ),
                articles: (
                  <T
                    area="docsGuide"
                    tags={{
                      r: ext(EHDS_URL),
                      a: art(57),
                      b: art(61),
                      c: art(63),
                      d: art(68),
                      e: art(73),
                      f: art(78),
                    }}
                  >
                    {
                      "<r>Regulation (EU) 2025/327</r> Art. <a>57</a>, <b>61</b>, <c>63</c>, <d>68</d>, <e>73</e>, <f>78</f>"
                    }
                  </T>
                ),
              },
              {
                id: "hospital",
                label: te("Hospital / Data Holder"),
                title: te("My data, in one view"),
                color: "text-(--accent)",
                q: te(
                  "Which consumers are trusted, what is flowing without cover, and are my own duties in order?",
                ),
                articles: (
                  <T
                    area="docsGuide"
                    tags={{
                      r: ext(EHDS_URL),
                      a: art(60),
                      b: art(61),
                      c: art(73),
                      d: art(77),
                      e: art(78),
                    }}
                  >
                    {
                      "<r>Regulation (EU) 2025/327</r> Art. <a>60</a>, <b>61</b>, <c>73</c>, <d>77</d>, <e>78</e>"
                    }
                  </T>
                ),
              },
            ].map((p) => (
              <div
                key={p.id}
                className="border border-(--border) rounded-lg p-3 hover:border-indigo-500/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${p.color}`}>
                      {p.label}
                    </span>
                    <span className="text-xs text-(--text-secondary)">
                      {p.title}
                    </span>
                  </div>
                  <Link
                    href={`/overview?persona=${p.id}`}
                    className="inline-flex items-center gap-1 text-xs text-(--text-secondary) hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
                  >
                    {t("Try it")} <ArrowRight size={12} />
                  </Link>
                </div>
                <p className="text-(--text-secondary) text-xs italic mb-1">
                  {t("“{q}”", { q: p.q })}
                </p>
                <p className="text-(--text-secondary) text-xs">{p.articles}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Getting Started ── */}
      <section className="mb-12" id="getting-started">
        <h2 className="text-2xl font-semibold mb-3">{t("Getting Started")}</h2>
        <MermaidDiagram
          chart={localizedChart("user-guide-workflow", lang)}
          caption={
            <T area="docsGuide" tags={{ a: art(57), b: art(69) }}>
              {
                "User workflow overview; governance follows <a>EHDS Art. 57</a> to <b>69</b>"
              }
            </T>
          }
        />
        <p className="text-(--text-secondary) text-sm mt-3 mb-6">
          <T area="docsGuide" tags={{ b: strong }}>
            {
              "After authenticating through Keycloak SSO, you land on the persona overview, opened at the tab for your role. From there you browse datasets, review patient timelines, run analytics, or check EHDS compliance. The <b>UserMenu</b> (top-right) shows your role badge."
            }
          </T>
        </p>

        <div className="space-y-6">
          <FeatureCard
            href="/"
            title={t("Home Dashboard")}
            icon={LayoutDashboard}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "The landing page presents a high-level overview of the dataspace: active participants, registered datasets, and recent transfers. Quick-action cards let you jump to common tasks.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: PharmaCo Research AG logs in and sees 5 active participants, 3 published datasets, and a pending contract negotiation with AlphaKlinik Berlin.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/onboarding"
            title={t("Participant Onboarding")}
            icon={UserPlus}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  a: repo(
                    "docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md?plain=1#L62-L72",
                  ),
                  i: ext(IDENTITY_HUB_URL),
                  d: ext(DCP_URL),
                  f: ext(CFM_URL),
                }}
              >
                {
                  "The onboarding wizard registers a new participant. On the default stack the hub provisions it itself (<a>ADR-078</a>): a control plane context, a DID with its keys in the <i>IdentityHub</i>, and a MembershipCredential requested over <d>DCP v1.0</d>. The <f>Connector Fabric Manager</f> did this before and still does under the edc018 profile only."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              <T area="docsGuide" tags={{ c: codeXs, w: ext(DID_WEB_URL) }}>
                {
                  "Example: Limburg Medical Centre joins the EHDS dataspace by providing its organization details, generating a <w>did:web</w> identifier such as <c>did:web:lmc.nl:clinic</c>, and obtaining a MembershipCredential."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/settings"
            title={t("Participant Settings")}
            icon={Settings}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ v: ext(DCP_URL), k: ext(KEYCLOAK_URL) }}
                vars={{ credential: PARTICIPANT_CREDENTIAL }}
              >
                {
                  "View and manage your participant profile, <v>verifiable credentials</v> (MembershipCredential, {credential}), connector endpoints, and <k>Keycloak</k> SSO configuration."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: AlphaKlinik Berlin checks that both its MembershipCredential and {credential} are active and not expired before publishing a new dataset.",
                { credential: PARTICIPANT_CREDENTIAL },
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/auth/eudi-qr"
            title={t("Sign in with the EUDI Wallet")}
            icon={Wallet}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  w: ext(D_YOU_URL),
                  o: ext(OPENID4VP_URL),
                  a: art(16),
                  e: ext(EIDAS_URL),
                }}
              >
                {
                  "A patient signs in with the person identification data (PID) in an EUDI Wallet, such as the German <w>d-you wallet</w>, instead of a password: the sign-in page shows a QR code, the wallet presents the PID over <o>OpenID4VP</o>, and the hub checks it with its own verifier (EHDS <a>Art. 16</a>, <e>eIDAS</e>). An account the Klarbefund app created can be linked to a PID once under My Health, Connect your EUDI wallet; the hub keeps a keyed fingerprint of the PID, never the name or birth date."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              <T area="docsGuide" tags={{ l: ext(EIDAS_LEVEL_HIGH_URL) }}>
                {
                  "Example: A patient scans the QR code with d-you, approves the presentation and lands in their own record at <l>assurance level high</l>. The static demo shows the flow with a simulated phone."
                }
              </T>
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── Availability (ADR-053) ── */}
      <section className="mb-12" id="availability">
        <h2 className="text-2xl font-semibold mb-3">
          {t("When Is the Live Demo Available?")}
        </h2>
        <p className="text-(--text-secondary) text-sm mb-4">
          {t(
            "The demo exists twice. The live dataspace runs the real connectors, identity services and databases, and to save running costs it is stopped outside office hours. The static demo is a copy of the same pages with synthetic data, and it is always available.",
          )}
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-(--border) rounded-lg">
            <thead>
              <tr className="bg-(--surface-2) text-left">
                <th className="px-3 py-2 font-semibold"></th>
                <th className="px-3 py-2 font-semibold">{t("Live demo")}</th>
                <th className="px-3 py-2 font-semibold">{t("Static demo")}</th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary)">
              <tr className="border-t border-(--border)">
                <td className="px-3 py-2 font-medium">{t("Address")}</td>
                <td className="px-3 py-2">
                  <code>{LIVE_HOST}</code>
                </td>
                <td className="px-3 py-2">
                  <a
                    href={LIVE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 dark:text-indigo-400 underline"
                  >
                    GitHub Pages
                  </a>
                </td>
              </tr>
              <tr className="border-t border-(--border)">
                <td className="px-3 py-2 font-medium">{t("Available")}</td>
                <td className="px-3 py-2">
                  <T
                    area="docsGuide"
                    tags={{
                      s: repo(
                        "docs/knowledge/runbooks/live-demo-off-hours.md?plain=1#L16-L25",
                      ),
                      a: repo(
                        "docs/ADRs/ADR-053-everything-stops-off-hours.md?plain=1#L35-L56",
                      ),
                    }}
                  >
                    {
                      "Monday to Friday, 07:00 to 20:00 Berlin time in summer and 06:00 to 19:00 in winter. Closed on Berlin public holidays (<s>schedule</s>, <a>ADR-053</a>)."
                    }
                  </T>
                </td>
                <td className="px-3 py-2">{t("Always")}</td>
              </tr>
              <tr className="border-t border-(--border)">
                <td className="px-3 py-2 font-medium">{t("Sign-in")}</td>
                <td className="px-3 py-2">
                  {t("Keycloak accounts per persona")}
                </td>
                <td className="px-3 py-2">
                  {t("A persona picker, no password")}
                </td>
              </tr>
              <tr className="border-t border-(--border)">
                <td className="px-3 py-2 font-medium">{t("Data")}</td>
                <td className="px-3 py-2">
                  {t(
                    "The live knowledge graph; negotiations and transfers really run",
                  )}
                </td>
                <td className="px-3 py-2">
                  {t("A fixed snapshot; actions are shown but not carried out")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-(--text-secondary) text-sm">
          {t(
            "If you open the live demo outside these hours, every page shows a notice saying when it is back, with a button that opens the same page in the static demo. The Klarbefund app cannot connect to EHDS or use its cloud analysis during these times either. Analysis on the phone keeps working.",
          )}
        </p>
      </section>

      {/* ── 3. Explore ── */}
      <section className="mb-12" id="explore">
        <h2 className="text-2xl font-semibold mb-4">{tn("Explore")}</h2>
        <div className="space-y-6">
          <FeatureCard
            href="/overview"
            title={tn("Persona Overview")}
            icon={Globe}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ r: ext(EHDS_URL) }}>
                {
                  "One view per role that answers the role's primary question. On the left, what needs attention right now, most urgent first, each with the article of <r>Regulation (EU) 2025/327</r> it concerns. On the right, a layered 3D scene of the knowledge graph behind it: the role's own decisions and their clocks, credentials, permits and contracts, data users and holders, datasets, and the months unfolded over time."
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm space-y-1 ml-4 list-disc">
              <li>
                {t("Tabs for Patient, Researcher, Access body and Data holder")}
              </li>
              <li>
                {t(
                  "Click a finding to select its node in the scene and unfold what lies behind it",
                )}
              </li>
              <li>
                {t(
                  "Turn the scene off (or ask your system for reduced motion) and the list on the left is the full view",
                )}
              </li>
            </ul>
            <p className="text-(--text-secondary) text-xs italic mt-2">
              <T area="docsGuide" tags={{ a: para("068.004") }}>
                {
                  "Example: MedReg DE sees that three applications passed the three-month decision deadline of <a>Art. 68(4)</a> and opens the queue by month."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/catalog"
            title={tn("Dataset Catalog")}
            icon={Database}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ h: ext(HEALTHDCAT_AP_URL), a: art(77) }}
              >
                {
                  "Browse and search <h>HealthDCAT-AP</h> metadata records for all published datasets. Each entry shows title, description, publisher, temporal/spatial coverage, and distribution formats. The catalog implements the EHDS metadata requirements (<a>Art. 77</a>) for discoverable, machine-readable dataset descriptions."
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm space-y-1 ml-4 list-disc">
              <li>{t("Filter by publisher, theme, or keyword")}</li>
              <li>
                {t("View distribution endpoints (FHIR, OMOP, bulk export)")}
              </li>
              <li>
                <T area="docsGuide" tags={{ d: ext(DQV_URL) }}>
                  {"Check data quality metrics (<d>DQV</d> dimensions)"}
                </T>
              </li>
              <li>{t("Initiate data access requests from catalog entries")}</li>
            </ul>
            <p className="text-(--text-secondary) text-xs italic mt-2">
              {t(
                "Example: PharmaCo Research AG searches for “diabetes” datasets and finds AlphaKlinik Berlin's Type 2 Diabetes Cohort with FHIR R4 and OMOP CDM distributions.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/catalog/editor"
            title={t("HealthDCAT-AP Editor")}
            icon={PencilLine}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  h: ext(HEALTHDCAT_AP_URL),
                  a: repo(
                    "docs/ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md?plain=1#L42-L64",
                  ),
                  i: ext(`${IMPL_2098_URL}#anx_1`),
                  d: ext(`${IMPL_2098_URL}#art_4`),
                  l: ext(HEALTHDCAT_AP_LATEST_URL),
                }}
              >
                {
                  "Data holders create and edit their dataset descriptions here. The hub serves them as <h>HealthDCAT-AP Release 8</h> (<a>ADR-063</a>). <i>Implementing Regulation (EU) 2026/2098</i> requires every dataset description to express its minimum metadata in HealthDCAT-AP from 26 March 2029 (<d>Art. 4</d>), and cites the <l>latest release</l> rather than a release number. Mandatory fields are marked, and a saved entry carries what Release 8 requires (access body, distribution, variables, contact point), so it passes the official validation at once."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic mt-2">
              <T area="docsGuide" tags={{ a: art(68) }}>
                {
                  "Example: AlphaKlinik Berlin adds its Type 2 Diabetes Cohort with an <a>Art. 68</a> data permit as the legal basis, then exports the catalogue as Turtle."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/patient"
            title={tn("Patient Journey")}
            icon={Search}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  f: ext(FHIR_RESOURCES_URL),
                  o: ext(OMOP_URL),
                  c: ext(`${EHDS_URL}#cpt_II`),
                }}
              >
                {
                  "View the clinical timeline for synthetic patients, showing <f>FHIR R4 resources</f> (Encounters, Conditions, Observations, Medications, Procedures) mapped to their <o>OMOP CDM</o> equivalents. This dual-view demonstrates how primary-use clinical data (<c>EHDS Chapter II</c>) can be transformed for secondary-use analytics while preserving semantic integrity."
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm space-y-1 ml-4 list-disc">
              <li>{t("Select patients from the patient list")}</li>
              <li>{t("Timeline displays events chronologically")}</li>
              <li>{t("Toggle between FHIR and OMOP views")}</li>
              <li>{t("Explore SNOMED/LOINC/RxNorm concept mappings")}</li>
            </ul>
            <p className="text-(--text-secondary) text-xs italic mt-2">
              <T
                area="docsGuide"
                tags={{
                  o: ext(`${OMOP_URL}#condition_occurrence`),
                  s: ext(SNOMED_HYPERTENSION_URL),
                }}
              >
                {
                  "Example: A data steward reviews the timeline for a synthetic patient with hypertension, verifying that the FHIR Condition correctly maps to OMOP <o>condition_occurrence</o> with <s>SNOMED code 38341003</s>."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/analytics"
            title={tn("OMOP Analytics")}
            icon={BarChart3}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ o: ext(OMOP_URL), a: art(53) }}>
                {
                  "Cohort-level research analytics powered by the <o>OMOP CDM</o> layer. Run aggregate queries across conditions, measurements, drug exposures, and procedures. This implements the EHDS secondary-use analytics capability (<a>Art. 53</a>) where researchers work with de-identified, standardised data."
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm space-y-1 ml-4 list-disc">
              <li>{t("View condition prevalence and demographics")}</li>
              <li>{t("Analyse drug exposure patterns")}</li>
              <li>{t("Run cohort characterisation queries")}</li>
              <li>{t("Export results for further analysis")}</li>
            </ul>
            <p className="text-(--text-secondary) text-xs italic mt-2">
              {t(
                "Example: PharmaCo Research AG runs a cohort query to identify patients with Type 2 Diabetes who received Metformin, showing age and gender distribution across the cohort.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/query"
            title={t("Natural Language / Federated Query")}
            icon={MessageSquare}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ c: ext(CYPHER_URL) }}>
                {
                  "A researcher with a data permit asks a question in plain language. A prepared question, a fulltext search or, where one is configured, a language model turns it into <c>Cypher</c>, which runs inside the secure processing environment; the page shows the Cypher, the permit it ran under and the rows that came back. The Federated button asks every SPE and merges the answers. Every answer about persons is k-anonymous: a count below 5 is shown as <5, and a share computed from it with it."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A researcher asks “What is the age distribution?”; the 0-17 group holds one person and comes back as <5, with a k = 5 badge saying how many values were suppressed.",
              )}
            </p>
          </FeatureCard>

          <div
            id="spes"
            className="rounded-xl border border-(--border) bg-(--surface-2) p-5"
          >
            <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-indigo-700 dark:text-indigo-400">
              <Server size={18} aria-hidden />{" "}
              {t("Two secure processing environments")}
            </h3>
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ a: art(73), o: ext(ODRL_URL), b: art(71) }}
              >
                {
                  "Row-level data is processed only inside a secure processing environment (EHDS <a>Art. 73</a>); only answers leave it. SPE-1 holds AlphaKlinik Berlin's patients, SPE-2 Limburg Medical Centre's, each a Neo4j workspace loaded for the permit, so a federated question has two contributors. Both apply the same rules before anything leaves: the data permit, the <o>ODRL policy</o>, the <b>Art. 71</b> opt-out (persons who opted out are never counted) and k = 5, including the rule that a contributor with fewer than 5 records withholds the whole answer, since a missing contributor would identify people. Every question is recorded on the audit chain."
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm mb-2 list-disc pl-5 space-y-1">
              <li>
                {t(
                  "Ask “How many SPEs can I access?” on the query page to see the environments and how many patients each holds.",
                )}
              </li>
              <li>
                <T
                  area="docsGuide"
                  tags={{
                    c: extCode(`${REPO_URL}docker-compose.trustee.yml#L1-L7`),
                    d: code,
                    t: ext(TRUSTEE_URL),
                  }}
                >
                  {
                    "Locally both run as workspaces loaded per permit from an encrypted extract (<c>docker-compose.trustee.yml</c> with the <d>federated</d> profile), with the access body's <t>Trustee</t> and its sample attester: labelled “Simulated attestation”. The static demo shows the same."
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsGuide"
                  tags={{
                    c: code,
                    d: code,
                    e: extCode(
                      `${REPO_URL}scripts/azure/21-aci-confidential-spe.sh#L3-L6`,
                    ),
                    g: ext(ACI_CONFIDENTIAL_URL),
                    h: repo(
                      "docs/ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md?plain=1#L113-L127",
                    ),
                  }}
                >
                  {
                    "On Azure both run as <g>ACI confidential container groups</g>, <c>mvhd-spe-1</c> and <d>mvhd-spe-2</d>, once <e>scripts/azure/21-aci-confidential-spe.sh</e> has run. Each proves its own container group on AMD SEV-SNP hardware: labelled “Attested: confidential workload”, and <h>the permit's policy hash is checked by hardware</h>."
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsGuide"
                  tags={{
                    l: attestationLink,
                    a: adr068Link,
                    n: repo(
                      "docs/ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md?plain=1#L90-L233",
                    ),
                    i: issue774Link,
                  }}
                >
                  {
                    "The operator sees the evidence behind each label on <l>SPE attestation</l>. The design is <a>ADR-068</a>; where it runs on Azure is <n>ADR-069</n> (<i>#774</i>)."
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ s: speDocLink }}>
                  {
                    "How the workspaces are built from confidential containers, attested and queried, step by step: <s>the secure processing environment</s> in the developer guide."
                  }
                </T>
              </li>
            </ul>
          </div>

          <FeatureCard
            href="/eehrxf"
            title={tn("EEHRxF Profiles")}
            icon={FileCheck}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: art(15) }}>
                {
                  "European EHR Exchange Format profile alignment view. Analyse which FHIR profiles satisfy EHDS priority categories (Patient Summary, ePrescription, Laboratory Results, Medical Imaging, Hospital Discharge) and identify coverage gaps. The EEHRxF is mandated by EHDS <a>Art. 15</a> to ensure interoperability of primary-use health data across Member States."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: MedReg DE reviews AlphaKlinik Berlin's profile coverage and sees that Patient Summary and Laboratory Results are fully aligned, while ePrescription has one missing profile.",
              )}
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── My Health: the patient's pages ── */}
      <section className="mb-12" id="my-health">
        <h2 className="text-2xl font-semibold mb-3">{tn("My Health")}</h2>
        <p className="text-(--text-secondary) text-sm mb-4">
          <T
            area="docsGuide"
            tags={{ a: art(3), g: ext(`${GDPR_URL}#art_15`) }}
          >
            {
              "A signed-in patient gets their own menu: one overview, their records, and the pages below. Each shows that patient's own record only; any other patient's record is refused (EHDS <a>Art. 3</a>, GDPR <g>Art. 15</g>)."
            }
          </T>
        </p>
        <div className="space-y-6">
          <FeatureCard
            href="/patient/query"
            title={tn("Personal Research")}
            icon={Search}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ a: art(3), g: ext(`${GDPR_URL}#art_15`) }}
              >
                {
                  "A natural-language question over the patient's own record (EHDS <a>Art. 3</a>, GDPR <g>Art. 15</g>): trends from fitness, lab and nutrition data, together with the relevant ePA events, computed only from that patient's data."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A patient asks how their cholesterol has changed since their last check-up.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/patient/profile"
            title={tn("Health Profile & Risks")}
            icon={Users}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "The patient's health profile and risk assessment, derived from their own record.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A patient reviews the risk factors the profile derives from their last lab results.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/patient/research"
            title={tn("Research Programs")}
            icon={TestTube}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ a: art(71), g: ext(`${GDPR_URL}#007.003`) }}
              >
                {
                  "The opt-out from all secondary use (EHDS <a>Art. 71</a>), at any time and reversible, and, separately, the research programmes the patient can join or leave, with the history of every consent given or withdrawn (GDPR <g>Art. 7(3)</g>)."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A patient opts out of secondary use; from then on every new research query leaves them out, and the opt-out is kept with its date until they opt back in.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/patient/insights"
            title={tn("Research Insights")}
            icon={Award}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "What research using the patient's data found, and the recommendations that follow for them.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A patient reads an insight from a diabetes study they contributed to.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/docs/klarbefund"
            title={t("Klarbefund: the iPhone app")}
            icon={Smartphone}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  a: ext(APP_ATTEST_URL),
                  d: repo(
                    "docs/ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md?plain=1#L29-L66",
                  ),
                  m: repo(
                    "docs/ADRs/ADR-057-klarbefund-sends-weekly-device-means.md?plain=1#L24-L46",
                  ),
                  t: ext(TESTFLIGHT_URL),
                }}
              >
                {
                  "Klarbefund turns a paper lab report into checkable values on the phone. Connected to the hub, it either creates its own sandbox account with an empty record (gated by Apple <a>App Attest</a>, <d>ADR-054</d>) or connects to an existing one: Health Profile shows a QR code, the app scans it and is connected. It sends the reports, vaccinations and medication plan the person chooses, and weekly device means behind a switch of their own (<m>ADR-057</m>). Delete all my data in the app also deletes the account it created on the hub. The beta is open through <t>TestFlight</t>."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A patient photographs a lab report, checks the values Klarbefund read, and sends the report to their record, where it appears under Patient Journey.",
              )}
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── 4. Governance ── */}
      <section className="mb-12" id="governance">
        <h2 className="text-2xl font-semibold mb-3">{tn("Governance")}</h2>
        <p className="text-(--text-secondary) text-sm mb-4">
          <T
            area="docsGuide"
            tags={{ c: ext(`${EHDS_URL}#cpt_IV`), a: art(67), b: art(68) }}
          >
            {
              "The governance modules cover EHDS compliance, protocol testing, and verifiable credential issuance under the European Health Data Space regulation (<c>Chapter IV</c>, Art. 50 to 81). Every data access follows the approval chain the Regulation sets: application, HDAB review and data permit (<a>Art. 67</a> and <b>68</b>). The hub then adds a contract negotiation and an audited transfer."
            }
          </T>
        </p>
        <MermaidDiagram
          chart={localizedChart("user-guide-compliance", lang)}
          caption={
            <T area="docsGuide" tags={{ a: art(67), b: art(68) }}>
              {
                "EHDS data access compliance workflow: the application of <a>Art. 67</a> and the permit of <b>Art. 68</b>"
              }
            </T>
          }
        />

        <div className="space-y-6 mt-6">
          <FeatureCard
            href="/compliance"
            title={tn("EHDS Approval")}
            icon={Award}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ a: art(67), b: art(68), c: para("053.001") }}
              >
                {
                  "Manage data access permits as required by EHDS <a>Art. 67</a> and <b>68</b>. Data users submit applications specifying the purpose, scope, and duration of data access. HDABs review applications against the permitted purposes in <c>Art. 53(1)</c> and issue verifiable credentials as proof of authorization."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              <T area="docsGuide" tags={{ a: art(68) }}>
                {
                  "Example: PharmaCo Research AG submits a data access application for the diabetes cohort. MedReg DE (HDAB) reviews the request, approves it under <a>Art. 68</a>, and a DataPermitCredential is issued."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/compliance/tck"
            title={tn("Protocol TCK")}
            icon={TestTube}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  p: repo("services/neo4j-proxy/src/routes/tck.ts#L6-L15"),
                  d: ext(DSP_URL),
                  s: extCode(
                    `${REPO_URL}scripts/run-ehds-dataspace-checks.sh#L5-L9`,
                  ),
                  k: ext(DSP_TCK_URL),
                  i: ext(ISSUE_338_URL),
                }}
                vars={{ script: "run-ehds-dataspace-checks.sh" }}
              >
                {
                  "The page runs the hub's own checks through the <p>neo4j-proxy</p>: the Dataspace Protocol (<d>DSP 2025-1</d>) catalog and message schemas, DID resolution, keys and the issuer service, and the graph's EHDS integrity. The compliance workflow also checks contract negotiation and transfer (<s>{script}</s>). None of them is the Eclipse <k>DSP Technology Compatibility Kit</k>, which has not yet been run against the hub (<i>#338</i>)."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              <T
                area="docsGuide"
                tags={{
                  c: extCode(
                    `${REPO_URL}scripts/compliance-baseline.json#L17-L22`,
                  ),
                }}
              >
                {
                  "Example: The operator runs these checks and compares the result with the floor recorded in <c>scripts/compliance-baseline.json</c>; a drop below it fails the compliance workflow."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/credentials"
            title={te("Verifiable Credentials")}
            icon={Shield}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ d: ext(DCP_URL) }}
                vars={{ credential: PARTICIPANT_CREDENTIAL }}
              >
                {
                  "View and manage verifiable credentials across all dataspace participants. Each participant holds a MembershipCredential and an {credential}, issued by the trusted issuer service. Credentials follow the <d>DCP v1.0</d> standard for decentralised claims, enabling trust without a central authority."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: The operator verifies that all 5 participants (AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre, Institut de Recherche Santé) each hold 2 active credentials.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/applications"
            title={tn("Apply for a Permit")}
            icon={FileCheck}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  a: para("067.002"),
                  b: para("068.004"),
                  c: para("061.004"),
                }}
              >
                {
                  "A data user applies for a data permit with the eleven items of Regulation (EU) 2025/327 <a>Art. 67(2)</a>, then follows what becomes of it: the access body's clock (<b>Art. 68(4)</b>), a notice that items are missing, the permit or the refusal, and the results the user communicates afterwards (<c>Art. 61(4)</c>)."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: PharmaCo Research AG applies for the Type 2 Diabetes Cohort and sees the access body's decision deadline count down.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/requests"
            title={tn("Statistical Requests")}
            icon={BarChart3}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: art(69) }}>
                {
                  "A health data request under <a>Art. 69</a>: the data user asks a question and, if the access body approves, receives an anonymised statistic and nothing else. The access body decides on the same page."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A researcher asks how many patients in the cohort have HbA1c above 7 % and receives a single count.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/supervision"
            title={tn("Supervision")}
            icon={Shield}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: art(63), f: para("063.002") }}>
                {
                  "<a>Art. 63</a>: the access body records a finding of non-compliance against a data user or holder, the party states its views within <f>four weeks</f>, the body takes a measure and publishes it; the body can also ask a party for information, answered on record."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: MedReg DE records a finding against a data user and the user responds within the four-week window.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/permits"
            title={tn("Permits Register")}
            icon={ClipboardList}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: art(57) }}>
                {
                  "The access body's register of applications received and permits granted, refused or revoked (<a>Art. 57</a>). Any signed-in participant can read it."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A data holder checks which permits currently cover its datasets.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/activity-report"
            title={tn("Activity Report")}
            icon={BarChart3}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: para("059.001") }}>
                {
                  "The access body's activity report under <a>Art. 59(1)(a) to (k)</a>, generated from the graph for a chosen period, with a Markdown export."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: MedReg DE generates the report for the last 24 months before publishing it.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/information"
            title={t("Secondary Use Information")}
            icon={BookOpen}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: para("058.001") }}>
                {
                  "What the access body tells the public about secondary use (<a>Art. 58(1)</a>): the legal basis, the safeguards, people's rights and how to exercise them, who has access to which datasets and why, and the results of the projects."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A patient reads which research projects use data from AlphaKlinik Berlin and how to opt out.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/jurisdictions"
            title={tn("National EHDS Rules")}
            icon={Scale}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: art(71), b: art(62) }}>
                {
                  "How Germany, Austria, Belgium, France, the Netherlands and Spain implement secondary use: the legal role of the access body, the national law it acts under, how a person objects (<a>Art. 71</a>), the fees (<b>Art. 62</b>) and the dates, each with its official source. The laws are real, the organisations on the hub fictional."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: A Spanish researcher checks how the opt-out works in Germany before applying for data held by AlphaKlinik Berlin.",
              )}
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── 5. Data Exchange ── */}
      <section className="mb-12" id="data-exchange">
        <h2 className="text-2xl font-semibold mb-3">{t("Data Exchange")}</h2>
        <p className="text-(--text-secondary) text-sm mb-4">
          <T
            area="docsGuide"
            tags={{ d: ext(DSP_URL), a: art(51), b: art(60) }}
          >
            {
              "The sovereign data exchange pipeline follows the Dataspace Protocol (<d>DSP 2025-1</d>): share assets, discover via federated catalog, negotiate contracts, manage tasks, and transfer data. This pipeline implements EHDS <a>Art. 51</a> and <b>60</b> requirements for making health data available while preserving data holder sovereignty through policy-controlled access."
            }
          </T>
        </p>

        <div className="space-y-6">
          <FeatureCard
            href="/data/share"
            title={tn("Share Data")}
            icon={Share2}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  h: ext(HEALTHDCAT_AP_URL),
                  o: ext(ODRL_URL),
                  a: art(60),
                }}
              >
                {
                  "Publish datasets with <h>HealthDCAT-AP</h> metadata and <o>ODRL</o> access policies for the federated catalog. Define distribution endpoints, data quality attributes, and usage constraints. Data holders use this page to fulfil their obligation under EHDS <a>Art. 60</a> to make data available for secondary use."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              <T
                area="docsGuide"
                tags={{ f: ext(FHIR_URL), a: para("053.001") }}
              >
                {
                  "Example: AlphaKlinik Berlin publishes a “Synthetic Diabetes Cohort” dataset with <f>FHIR R4</f> bulk export distribution, a usage policy for scientific research under EHDS <a>Art. 53(1)(e)</a>, and spatial coverage set to DE."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/data/discover"
            title={tn("Discover")}
            icon={Compass}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ e: ext(EDC_URL) }}>
                {
                  "Search the federated catalog across all connected dataspace participants. Results aggregate datasets from multiple <e>EDC connectors</e>, showing availability and access terms. The federated catalog enables cross-border dataset discovery without centralising metadata."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: PharmaCo Research AG discovers 3 datasets across 2 participants for “cardiovascular” research: one from AlphaKlinik Berlin and two from Limburg Medical Centre.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/negotiate"
            title={tn("Negotiate")}
            icon={Handshake}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  d: ext(`${DSP_URL}#negotiation-protocol`),
                  a: art(68),
                  b: para("061.001"),
                }}
              >
                {
                  "Initiate and track <d>DSP contract negotiations</d> with data holders. View negotiation state (REQUESTED, AGREED, VERIFIED, FINALIZED), ODRL policy terms, and counter-offer history. The Regulation does not ask for a contract negotiation: access rests on the data permit (<a>Art. 68</a>), and a data user may process the data only in accordance with it (<b>Art. 61(1)</b>). The DSP negotiation is how the hub implements that, agreeing the terms before any transfer occurs."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              <T area="docsGuide" tags={{ a: para("053.001") }}>
                {
                  "Example: PharmaCo Research AG initiates a contract negotiation with AlphaKlinik Berlin for the diabetes cohort. The negotiation progresses to FINALIZED with a scientific research policy under EHDS <a>Art. 53(1)(e)</a>."
                }
              </T>
            </p>
          </FeatureCard>

          <FeatureCard
            href="/tasks"
            title={tn("Tasks")}
            icon={ClipboardList}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: para("073.001") }}>
                {
                  "Monitor the task queue for pending and active data transfer operations. Tasks track the full lifecycle from initiation through provisioning to completion, providing an audit trail for accountability; in the secure processing environment the EHDS requires identifiable access logs (<a>Art. 73(1)(e)</a>)."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: The operator monitors a bulk FHIR export task from AlphaKlinik Berlin to PharmaCo Research AG, currently at the provisioning stage with an estimated 2-minute completion time.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/data/transfer"
            title={tn("Transfer")}
            icon={ArrowLeftRight}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ a: para("061.001"), b: art(73) }}>
                {
                  "Each agreed contract appears once, with where it stands. Start Transfer asks the provider's connector for the data, after the hub has checked that a data permit covers the participant you act as (<a>Art. 61(1)</a>); when none does, the page says whose permit is missing or expired. The page follows the transfer until the data is ready. Open shows the data, Download saves it, and Import into SPE loads it into a secure processing environment (<b>Art. 73</b>); on the live hub a stopped workspace starts first and keeps the data until it stops. The import then closes the transfer, so the access to the provider's data ends; a new transfer imports it again. Details holds the agreed terms, folded until you open them, and every transfer under the contract with its DSP state."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: PharmaCo Research AG starts the transfer of its Fhir Patient Search contract with AlphaKlinik Berlin. A few seconds later the data is ready, and it imports 100 pseudonymised records into SPE-1.",
              )}
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── 6. Administration ── */}
      <section className="mb-12" id="admin">
        <h2 className="text-2xl font-semibold mb-3">{t("Administration")}</h2>
        <p className="text-(--text-secondary) text-sm mb-4">
          <T area="docsGuide" tags={{ k: ext(KEYCLOAK_URL) }}>
            {
              "Platform administrators manage participants, access policies, and audit logs. The admin dashboard provides an overview of system health, active connections, and recent activity. Access requires the EDC_ADMIN role assigned through <k>Keycloak</k>. No article of the Regulation defines a dataspace operator; the role is the hub's own, responsible for a technical infrastructure that supports interoperable, sovereign data exchange."
            }
          </T>
        </p>

        <div className="space-y-6">
          <FeatureCard
            href="/admin"
            title={tn("Operator Dashboard")}
            icon={LayoutDashboard}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "The admin dashboard shows system health at a glance: connector uptime, active participants, recent negotiations, transfer throughput, and credential status.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: The operator sees all 5 participants are online, 3 contract negotiations are active, and 12 transfers completed in the last 24 hours with no failures.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/admin/components"
            title={tn("EDC Components")}
            icon={Cpu}
            requiresJAD
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  e: ext(EDC_URL),
                  i: ext(IDENTITY_HUB_URL),
                  f: ext(CFM_URL),
                }}
              >
                {
                  "Inspect the runtime status of <e>Eclipse Dataspace Connector</e> components: Control Plane, Data Plane, <i>Identity Hub</i>, Issuer Service, and, under the edc018 profile only, the <f>Connector Fabric Manager</f>. View health checks, versions, and configuration details."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: The operator checks that the Control Plane (port 11003) and the Identity Hub (port 11005) both report healthy on the local stack.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/admin/attestation"
            title={tn("SPE attestation")}
            icon={Fingerprint}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "The evidence behind each secure processing environment's label, for the operator (EDC_ADMIN): the verdict, who verified it (the access body's Trustee), what was proven and what was not, the measurements, and the chain from the data permit to its policy hash, the Trustee's key release and the loaded workspace, with the SPE's last audit events. Each SPE on the operator dashboard links to it.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: the operator checks that SPE-2 of Limburg Medical Centre got its key for MedReg DE's permit, and reads why an earlier attempt was refused.",
              )}
            </p>
          </FeatureCard>
          <div
            id="spe-attestation"
            className="rounded-xl border border-(--border) bg-(--surface-2) p-5"
          >
            <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-indigo-700 dark:text-indigo-400">
              <Fingerprint size={18} aria-hidden />{" "}
              {t("SPE attestation: what the page proves")}
            </h3>
            <p className="text-(--text-secondary) text-sm mb-2">
              <T area="docsGuide" tags={{ l: attestationLink }}>
                {
                  "<l>SPE attestation</l> shows, for each secure processing environment, the evidence its workspace sent before it got the key to its encrypted extract, and what the access body's Trustee concluded from it."
                }
              </T>
            </p>
            <ul className="text-(--text-secondary) text-sm mb-2 list-disc pl-5 space-y-1">
              <li>
                <T area="docsGuide" tags={{ b: strongPrimary }}>
                  {
                    "<b>Verdict.</b> “Verified, key released”: the Trustee checked the evidence against its reference values and the data permit's policy hash, and released the key. “Verified, key refused”: the evidence was genuine but did not match, so the workspace holds no data."
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ b: strongPrimary }}>
                  {
                    "<b>Label.</b> “Attested: confidential workload” is hardware evidence for this container group, on Azure. “Simulated attestation” means the Trustee, its policy, the key release and the audit record are real, but the evidence comes from the sample attester, so nothing is proven in hardware: this is what the local stack and the static demo show."
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsGuide"
                  tags={{
                    b: strongPrimary,
                    h: ext(ACI_ATTESTATION_URL),
                    p: repo(
                      "docs/ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md?plain=1#L113-L127",
                    ),
                  }}
                >
                  {
                    "<b>Scope and host data.</b> Scope “Workload level” means the report's <h>HOST_DATA</h> is the SHA-256 of the container group's policy, which is <p>the data permit's policy hash</p>: the hardware checks that the workspace runs exactly what the permit allows."
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsGuide"
                  tags={{ b: strongPrimary, u: ext(ACI_ATTESTATION_URL) }}
                >
                  {
                    "<b>Measurement.</b> The launch measurement of Microsoft's <u>utility VM</u>, which runs the containers. The operator pinned it after comparing it with Microsoft's signed endorsement."
                  }
                </T>
              </li>
              <li>
                <T area="docsGuide" tags={{ b: strongPrimary }}>
                  {
                    "<b>Reported TCB.</b> The firmware versions of the host the group runs on. Hosts differ, so the Trustee holds a minimum for each component and accepts any version at or above it: a host with newer AMD firmware passes, one below the minimum is refused."
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsGuide"
                  tags={{
                    b: strongPrimary,
                    c: codeXs,
                    d: codeXs,
                    e: codeXs,
                    a: auditLink,
                  }}
                >
                  {
                    "<b>Key released and Workspace loaded.</b> When the Trustee released the key and when the extract was loaded. The same steps are on the audit chain as <c>spe.attestation</c>, <d>spe.key_release</d> and <e>spe.workspace_loaded</e>, in the tab Secure processing of <a>Audit & Provenance</a>."
                  }
                </T>
              </li>
            </ul>
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ b: strongPrimary, u: ext(ACI_ATTESTATION_URL) }}
              >
                {
                  "<b>Residual trust.</b> The evidence rests on AMD's root of trust, and the <u>utility VM image</u> is trusted because Microsoft endorses its measurement; the endorsement's issuer and content were checked, its signature not yet cryptographically. The Trustee runs in the hub's own subscription, operated as if by MedReg DE; for the claim to hold fully, the access body runs it in a subscription of its own."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-sm">
              <T
                area="docsGuide"
                tags={{
                  a: repo(
                    "docs/ADRs/ADR-072-spe-workspaces-start-on-demand.md?plain=1#L44-L131",
                  ),
                  i: issue774Link,
                  r: speRunbookLink,
                  s: speDocLink,
                }}
              >
                {
                  "On Azure the workspaces are stopped by default and start on demand (<a>ADR-072</a>, <i>#774</i>): a federated query or Start on the admin page starts them, which takes about a minute until attestation and key release and three to four minutes until both answer queries; after 30 minutes without a query they stop again. How the attestation is set up, pinned and checked: the <r>runbook</r>. The concepts behind it: <s>the secure processing environment</s>."
                }
              </T>
            </p>
          </div>
          <FeatureCard
            href="/admin/tenants"
            title={t("Tenant Management")}
            icon={Users}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{
                  a: repo(
                    "docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md?plain=1#L62-L72",
                  ),
                  f: ext(CFM_URL),
                }}
              >
                {
                  "Each participant's control plane context and its provisioning state: whether its MembershipCredential has arrived. The hub provisions participants itself (<a>ADR-078</a>); the tenants and virtual participant agents of the <f>Connector Fabric Manager</f> exist only under the edc018 profile."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: The operator checks that a newly onboarded clinic's tenant finished provisioning.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/admin/participants"
            title={t("Participant Directory")}
            icon={UserPlus}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "Every participant in the dataspace with its DID and credentials; the operator can add or remove one.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: The operator adds Limburg Medical Centre and confirms its DID resolves.",
              )}
            </p>
          </FeatureCard>
          <FeatureCard
            href="/admin/policies"
            title={t("Policy Definitions")}
            icon={ScrollText}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              <T
                area="docsGuide"
                tags={{ o: ext(ODRL_URL), a: para("053.001") }}
              >
                {
                  "The <o>ODRL policies</o> each participant offers its data under, grouped by participant. New policies start from a template for a permitted purpose of <a>Art. 53</a> (scientific research, public health, official statistics, AI training and more), with the permitted purposes, the duration of use and the duties attached; the JSON can be edited directly."
                }
              </T>
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: the operator gives Limburg Medical Centre a policy for scientific research only, valid one year, that forbids re-identification.",
              )}
            </p>
          </FeatureCard>

          <FeatureCard
            href="/admin/audit"
            title={tn("Audit & Provenance")}
            icon={FileCheck}
          >
            <p className="text-(--text-secondary) text-sm mb-2">
              {t(
                "The audit log and provenance trail, with the retention settings. Shared with the access body, which uses it for supervision.",
              )}
            </p>
            <p className="text-(--text-secondary) text-xs italic">
              {t(
                "Example: MedReg DE traces which queries touched a dataset in the last month.",
              )}
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* ── Help ── */}
      <section
        className="bg-(--surface-2)/50 border border-(--border) rounded-xl p-6"
        id="help"
      >
        <h2 className="font-semibold mb-2">{t("Need Help?")}</h2>
        <p className="text-(--text-secondary) text-sm mb-2">
          <T
            area="docsGuide"
            tags={{ d: devGuideLink, r: archLink, a: liveLink }}
          >
            {
              "For technical questions, see the <d>Developer Guide</d>. For architecture details, visit the <r>Architecture Diagrams</r>. Try the live demo at <a>GitHub Pages</a>."
            }
          </T>
        </p>
        <p className="text-(--text-secondary) text-sm">
          <T area="docsGuide" tags={{ j: journeyLink }}>
            {
              "For the complete end-to-end walkthrough of every persona and workflow, read the <j>Full User Journey</j>."
            }
          </T>
        </p>
      </section>
    </div>
  );
}
