"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MapPin,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ParticipantProfile {
  dataspaceProfileId?: string;
  participantContextId: string;
  tenantId?: string;
  identifier?: string;
  did?: string;
  state?: string;
}

interface Tenant {
  id: string;
  version: number;
  properties: {
    displayName?: string;
    role?: string;
    ehdsParticipantType?: string;
    organization?: string;
  };
  participantProfiles: ParticipantProfile[];
}

type RegistrationStep = "form" | "submitting" | "done";

// ---------------------------------------------------------------------------
// Fictive contact database for demo participants
// ---------------------------------------------------------------------------
const CONTACT_DB: Record<
  string,
  {
    address: string;
    email: string;
    website: string;
    dpoName: string;
    dpoEmail: string;
  }
> = {
  "AlphaKlinik Berlin": {
    address: "Gesundheitsplatz 1, 10117 Berlin, Germany",
    email: "forschung@alpha-klinik.de",
    website: "https://www.alpha-klinik.de",
    dpoName: "Prof. Dr. Klaus Weber",
    dpoEmail: "datenschutz@alpha-klinik.de",
  },
  "PharmaCo Research AG": {
    address: "Industriestraße 42, 51373 Leverkusen, Germany",
    email: "clinical-research@pharmaco.de",
    website: "https://www.pharmaco.de/research",
    dpoName: "Dr. Sandra Koch",
    dpoEmail: "data-protection@pharmaco.de",
  },
  "MedReg DE": {
    address: "Regulierungsallee 3, 53175 Bonn, Germany",
    email: "info@medreg.de",
    website: "https://www.medreg.de",
    dpoName: "Dr. Frank Bauer",
    dpoEmail: "datenschutz@medreg.de",
  },
  "Limburg Medical Centre": {
    address: "Postbus 5500, 6202 AZ Maastricht, Netherlands",
    email: "research@lmc.nl",
    website: "https://www.lmc.nl",
    dpoName: "Dr. Jan de Vries",
    dpoEmail: "privacy@lmc.nl",
  },
  "Institut de Recherche Santé": {
    address: "12 Rue de la Santé, 75014 Paris, France",
    email: "contact@irs.fr",
    website: "https://www.irs.fr",
    dpoName: "Dr. Marie Dupont",
    dpoEmail: "dpo@irs.fr",
  },
};

// ---------------------------------------------------------------------------
// EHDS + contractual requirements content
// ---------------------------------------------------------------------------
const REQUIREMENTS = [
  {
    category: "EHDS Regulation (EU 2025/327) — Secondary Use",
    items: [
      "Art. 5: Data holders are mandated to share health data for approved secondary-use purposes on request via HDAB.",
      "Purpose limitation: only approved uses — research, policy analysis, education, statistics.",
      "Pseudonymisation required before transfer; re-identification is prohibited (Art. 33).",
      "Data must be provided via an accredited Secure Processing Environment (SPE) listed in the HealthDCAT-AP catalogue.",
      "Interoperability: FHIR R4 and OMOP CDM formats required for clinical data exchange.",
      "Audit log retention for 10 years (Art. 34 accountability).",
    ],
  },
  {
    category: "Contractual / NDA Requirements",
    items: [
      "Data Access Agreement (DAA) signed between data user and HDAB before any transfer.",
      "Data Processing Agreement (DPA) — GDPR Art. 28 compliant, listing all sub-processors.",
      "Mutual Non-Disclosure Agreement (NDA) covering proprietary algorithms, intermediate results, and derived datasets.",
      "Sub-processor disclosure if third-party cloud infrastructure is involved in processing.",
      "Breach notification procedure within 72 hours per GDPR Art. 33.",
    ],
  },
  {
    category: "Technical Dataspace Prerequisites (EDC-V / DCP)",
    items: [
      "Valid did:web DID registered with IdentityHub and endorsed by HDAB VC credential.",
      "Signed EDC-V connector policies: dataspace membership, EHDS-purpose, data-usage constraints.",
      "Encrypted transfer channel (AES-256-GCM) via EDC Dataspace Protocol (DCP).",
      "NATS event subscription for real-time audit events and contract negotiation callbacks.",
      "Health Dataspace profile registered in CFM with correct EHDS participant type.",
    ],
  },
];

// ---------------------------------------------------------------------------
// EHDS roles for registration form
// ---------------------------------------------------------------------------
const EHDS_ROLES = [
  {
    value: "data-holder",
    label: "Data Holder",
    desc: "Provides health data (hospitals, registries)",
  },
  {
    value: "data-user",
    label: "Data User",
    desc: "Consumes health data (researchers, pharma)",
  },
  {
    value: "health-data-access-body",
    label: "Health Data Access Body",
    desc: "Governs data access (regulators)",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function deriveStatus(tenant: Tenant): "active" | "provisioning" | "pending" {
  const profiles = tenant.participantProfiles || [];
  if (profiles.length === 0) return "pending";
  // Check both live EDC-V format (identifier) and mock format (did + state)
  const hasIdentity = profiles.some(
    (p) =>
      (p.identifier && p.identifier !== "null") ||
      (p.did && p.did !== "null") ||
      p.state === "ACTIVATED",
  );
  if (hasIdentity) return "active";
  return "provisioning";
}

function fallbackContact(org: string) {
  const slug = org
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return {
    address: `${org}, Germany`,
    email: `contact@${slug}.de`,
    website: `https://www.${slug}.de`,
    dpoName: "Data Protection Officer",
    dpoEmail: `dpo@${slug}.de`,
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({
  status,
}: {
  status: "active" | "provisioning" | "pending";
}) {
  if (status === "active")
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-700">
        <CheckCircle2 size={10} /> Active
      </span>
    );
  if (status === "provisioning")
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-700">
        <Clock size={10} className="animate-pulse" /> Provisioning
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border)]">
      <Circle size={10} /> Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline onboarding steps — derived from tenant data (no EDC-V API call needed)
// ---------------------------------------------------------------------------
function OnboardingSteps({ tenant }: { tenant: Tenant }) {
  const profiles = tenant.participantProfiles || [];
  const hasProfile = profiles.length > 0;
  const hasDid = profiles.some(
    (p) =>
      (p.identifier && p.identifier !== "null") || (p.did && p.did !== "null"),
  );
  const status = deriveStatus(tenant);

  const steps = [
    {
      label: "Tenant Created",
      done: true,
      inProgress: false,
      desc: "Organisation registered in CFM TenantManager",
    },
    {
      label: "Participant Context",
      done: hasProfile,
      inProgress: !hasProfile,
      desc: "EDC-V participant context provisioned",
    },
    {
      label: "DID Provisioned",
      done: hasDid,
      inProgress: hasProfile && !hasDid,
      desc: "Decentralised Identifier (did:web) created via IdentityHub",
    },
    {
      label: "Credentials Issued",
      done: hasDid,
      inProgress: hasDid && status !== "active",
      desc: "EHDS Verifiable Credentials available",
    },
    {
      label: "Active in Dataspace",
      done: status === "active",
      inProgress: hasDid && status !== "active",
      desc: "Ready to negotiate contracts and transfer data",
    },
  ];

  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={s.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            {s.done ? (
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            ) : s.inProgress ? (
              <Clock
                size={16}
                className="text-yellow-400 animate-pulse shrink-0"
              />
            ) : (
              <Circle size={16} className="text-gray-600 shrink-0" />
            )}
            {i < steps.length - 1 && (
              <div
                className={`w-0.5 h-5 mt-0.5 ${
                  s.done ? "bg-green-700" : "bg-gray-700"
                }`}
              />
            )}
          </div>
          <div className="pb-4">
            <p
              className={`text-xs font-medium ${
                s.done
                  ? "text-green-400"
                  : s.inProgress
                    ? "text-yellow-400"
                    : "text-[var(--text-secondary)]"
              }`}
            >
              {s.label}
            </p>
            <p className="text-xs text-gray-600">{s.desc}</p>
          </div>
        </div>
      ))}
      {profiles.length > 0 && (
        <div className="mt-1 space-y-1 border-t border-[var(--border)]/50 pt-3">
          {profiles.map((p, i) => (
            <div
              key={i}
              className="text-xs text-[var(--text-secondary)] font-mono truncate"
            >
              {p.identifier || p.did
                ? `DID: ${p.identifier || p.did}`
                : `Profile: ${p.participantContextId || p.dataspaceProfileId}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable participant card
// ---------------------------------------------------------------------------
function ParticipantCard({
  tenant,
  defaultExpanded = false,
}: {
  tenant: Tenant;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const name = tenant.properties.displayName || tenant.id;
  const org = tenant.properties.organization || name;
  const role =
    tenant.properties.role ||
    tenant.properties.ehdsParticipantType ||
    "unknown";
  const status = deriveStatus(tenant);
  const contact = CONTACT_DB[name] || fallbackContact(org);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        expanded
          ? "border-layer2/60 bg-[var(--surface)]/80"
          : "border-[var(--border)] bg-[var(--surface)]/50 hover:border-gray-600"
      }`}
    >
      {/* Header */}
      <button
        className="w-full text-left flex items-center gap-4 p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <Building2 size={20} className="text-layer2 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--text-primary)]">{name}</p>
            <StatusBadge status={status} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {org} · {role} · {tenant.participantProfiles?.length || 0}{" "}
            profile(s)
          </p>
        </div>
        {expanded ? (
          <ChevronDown
            size={16}
            className="text-[var(--text-secondary)] shrink-0"
          />
        ) : (
          <ChevronRight
            size={16}
            className="text-[var(--text-secondary)] shrink-0"
          />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-[var(--border)]/50 pt-4 space-y-5">
          {/* Contact columns */}
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                Organisation
              </h4>
              <p className="text-sm font-medium text-gray-200">{org}</p>
              <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <MapPin
                  size={12}
                  className="text-[var(--text-secondary)] mt-0.5 shrink-0"
                />
                <span>{contact.address}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Mail
                  size={12}
                  className="text-[var(--text-secondary)] shrink-0"
                />
                <a
                  href={`mailto:${contact.email}`}
                  className="text-layer2 hover:underline"
                >
                  {contact.email}
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <ExternalLink
                  size={12}
                  className="text-[var(--text-secondary)] shrink-0"
                />
                <a
                  href={contact.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-layer2 hover:underline"
                >
                  {contact.website.replace("https://", "")}
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                Data Compliance Officer
              </h4>
              <p className="text-sm font-medium text-gray-200">
                {contact.dpoName}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <Mail
                  size={12}
                  className="text-[var(--text-secondary)] shrink-0"
                />
                <a
                  href={`mailto:${contact.dpoEmail}`}
                  className="text-layer2 hover:underline"
                >
                  {contact.dpoEmail}
                </a>
              </div>
              <p className="text-xs text-gray-600 italic">
                GDPR Art. 37 / EHDS Art. 34 appointed contact
              </p>
            </div>
          </div>

          {/* Tenant ID */}
          <p className="text-xs text-gray-600">
            Tenant ID:{" "}
            <span className="font-mono text-[var(--text-secondary)]">
              {tenant.id}
            </span>
          </p>

          {/* Onboarding progress */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              Onboarding Progress
            </h4>
            <OnboardingSteps tenant={tenant} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EHDS requirements accordion (bottom of page)
// ---------------------------------------------------------------------------
function EhdsRequirements() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-10 border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--surface-2)]/40 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <FileText size={18} className="text-layer2 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm">
            EHDS &amp; Contractual Requirements for Data Sharing
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Regulatory, NDA, and technical prerequisites before data exchange
          </p>
        </div>
        {open ? (
          <ChevronDown size={16} className="text-[var(--text-secondary)]" />
        ) : (
          <ChevronRight size={16} className="text-[var(--text-secondary)]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 py-5 space-y-6">
          {REQUIREMENTS.map((section) => (
            <div key={section.category}>
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                {section.category}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-[var(--text-primary)]"
                  >
                    <span className="text-layer2 mt-0.5 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-gray-600 italic pt-2 border-t border-[var(--border)]">
            Note: In this demo environment all participants are pre-seeded. In
            production, onboarding triggers automated DID provisioning,
            credential issuance, and policy activation via the CFM orchestration
            agents.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page (inner — uses useSearchParams, must be wrapped in Suspense)
// ---------------------------------------------------------------------------
function OnboardingContent() {
  const searchParams = useSearchParams();
  const highlightTenantId = searchParams.get("tenantId");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<RegistrationStep>("form");
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("data-holder");

  const loadTenants = () => {
    setLoading(true);
    fetchApi("/api/participants/me")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setTenants(Array.isArray(d) ? d : d.tenants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep("submitting");
    setError(null);

    try {
      const res = await fetchApi("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          organization,
          role,
          ehdsParticipantType: role,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Registration failed");
      }

      setStep("done");
      loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStep("form");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageIntro
          title="Participant Onboarding"
          icon={UserPlus}
          description="Register your organisation as a participant in the European Health Data Space. Each participant receives a DID identity, Verifiable Credentials, and a dataspace profile to enable trusted data sharing."
          nextStep={{ href: "/catalog", label: "Explore Datasets" }}
          infoText="After onboarding, your organisation can share or consume health data under EHDS Regulation (EU) 2025/327. The registration creates a tenant, participant context, and DID:web identity."
          docLink={{ href: "/docs/user-guide", label: "Read the User Guide" }}
        />

        {/* Registered participants */}
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-8">
            <Loader2 size={16} className="animate-spin" />
            Loading registered participants…
          </div>
        ) : tenants.length > 0 ? (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              Registered Participants
            </h2>
            <div className="grid gap-3">
              {tenants.map((t) => (
                <ParticipantCard
                  key={t.id}
                  tenant={t}
                  defaultExpanded={t.id === highlightTenantId}
                />
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-3">
              Click a participant card to expand contact details and onboarding
              status.
            </p>
          </div>
        ) : null}

        {/* Registration form / success */}
        {step === "done" ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center border border-[var(--border)] rounded-xl">
            <CheckCircle2 size={48} className="text-green-400" />
            <h2 className="text-xl font-semibold">Registration Submitted</h2>
            <p className="text-[var(--text-secondary)] text-sm max-w-md">
              Your participant context has been created. DID provisioning and
              credential issuance will proceed automatically via CFM agents.
            </p>
            <button
              onClick={() => {
                setStep("form");
                setDisplayName("");
                setOrganization("");
                setRole("data-holder");
              }}
              className="mt-2 px-4 py-2 border border-gray-600 text-[var(--text-primary)] rounded-lg text-sm hover:border-gray-400"
            >
              Register another participant
            </button>
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <UserPlus size={20} className="text-layer2" />
              <h2 className="font-semibold">New Participant Registration</h2>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-sm text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. University Hospital Berlin"
                  className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Organisation
                </label>
                <input
                  type="text"
                  required
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. AlphaKlinik Berlin University Hospital"
                  className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  EHDS Role
                </label>
                <div className="grid gap-2">
                  {EHDS_ROLES.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        role === r.value
                          ? "border-layer2 bg-layer2/10"
                          : "border-[var(--border)] hover:border-gray-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r.value}
                        checked={role === r.value}
                        onChange={() => setRole(r.value)}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium text-sm">{r.label}</span>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {r.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={step === "submitting"}
                className="flex items-center gap-2 px-5 py-2.5 bg-layer2 text-white rounded-lg text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
              >
                {step === "submitting" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Registering…
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    Register Participant
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* EHDS + NDA requirements accordion */}
        <EhdsRequirements />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default export — wraps content in Suspense (required for useSearchParams)
// ---------------------------------------------------------------------------
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}
