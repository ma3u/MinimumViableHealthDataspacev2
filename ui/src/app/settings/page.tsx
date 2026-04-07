"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, type ElementType } from "react";
import {
  Loader2,
  Settings2,
  Save,
  CheckCircle2,
  AlertCircle,
  User,
  Globe,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface VPA {
  id: string;
  type: string;
  state: string;
}

interface ParticipantProfile {
  id: string;
  identifier: string;
  tenantId: string;
  error?: boolean;
  vpas?: VPA[];
  properties?: {
    "cfm.vpa.state"?: {
      participantContextId?: string;
      credentialRequest?: string;
      holderPid?: string;
    };
    displayName?: string;
  };
}

interface Tenant {
  id: string;
  version: number;
  properties: Record<string, string>;
  participantProfiles: ParticipantProfile[];
}

interface VerifiableCredential {
  id?: string;
  type?: string[];
  issuer?: string;
  issuanceDate?: string;
  expirationDate?: string;
  credentialSubject?: Record<string, unknown>;
}

interface CredentialContext {
  profileId: string;
  participantContextId: string | null;
  did?: string;
  credentials: VerifiableCredential[];
  error?: string;
}

export default function SettingsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [credentials, setCredentials] = useState<CredentialContext[]>([]);
  const [credsLoading, setCredsLoading] = useState(false);

  // Editable contact field state — seeded from tenant properties
  const [form, setForm] = useState({
    displayName: "",
    organization: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    website: "",
  });

  useEffect(() => {
    fetchApi("/api/participants/me")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : d.tenants || [];
        setTenants(list);
        if (list.length > 0) {
          setSelected(list[0]);
          seedForm(list[0]);
          loadCredentials(list[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seedForm(t: Tenant) {
    const p = t.properties || {};
    setForm({
      displayName: p.displayName || "",
      organization: p.organization || "",
      contactPerson: p.contactPerson || "",
      email: p.email || "",
      phone: p.phone || "",
      address: p.address || "",
      city: p.city || "",
      postalCode: p.postalCode || "",
      country: p.country || "",
      website: p.website || "",
    });
  }

  function handleSelect(id: string) {
    const t = tenants.find((t) => t.id === id) || null;
    setSelected(t);
    if (t) {
      seedForm(t);
      loadCredentials(t.id);
    }
    setSaved(false);
    setSaveError("");
  }

  async function loadCredentials(tenantId: string) {
    setCredsLoading(true);
    try {
      const res = await fetchApi(`/api/participants/${tenantId}/credentials`);
      const data = res.ok ? await res.json() : [];
      const arr = Array.isArray(data) ? data : [];
      if (
        arr.length > 0 &&
        arr.some((c: CredentialContext) => c.credentials?.length > 0)
      ) {
        setCredentials(arr);
        return;
      }
      // Fallback: load from global credentials endpoint and match by tenant DID
      await loadCredentialsFallback(tenantId);
    } catch {
      await loadCredentialsFallback(tenantId).catch(() => setCredentials([]));
    } finally {
      setCredsLoading(false);
    }
  }

  async function loadCredentialsFallback(tenantId: string) {
    try {
      const res = await fetchApi("/api/credentials");
      if (!res.ok) {
        setCredentials([]);
        return;
      }
      const raw = await res.json();
      const allCreds = raw.credentials || raw || [];
      if (!Array.isArray(allCreds)) {
        setCredentials([]);
        return;
      }
      // Resolve DIDs for this tenant
      const tenant = tenants.find((t) => t.id === tenantId);
      const dids = new Set(
        (tenant?.participantProfiles || [])
          .map((pp) => {
            const id = pp.identifier
              ? decodeURIComponent(pp.identifier)
              : undefined;
            const d = (pp as unknown as { did?: string }).did;
            return id || d;
          })
          .filter(Boolean),
      );
      const matched = allCreds.filter(
        (c: { subjectDid?: string }) => c.subjectDid && dids.has(c.subjectDid),
      );
      if (matched.length > 0) {
        setCredentials([
          {
            profileId: "mock-fallback",
            participantContextId: null,
            credentials: matched.map(
              (c: {
                credentialId?: string;
                credentialType?: string;
                issuerDid?: string;
                issuedAt?: string;
                expiresAt?: string;
              }) => ({
                id: c.credentialId,
                type: c.credentialType ? [c.credentialType] : [],
                issuer: c.issuerDid,
                issuanceDate: c.issuedAt,
                expirationDate: c.expiresAt,
                credentialSubject: c as unknown as Record<string, unknown>,
              }),
            ),
          },
        ]);
      } else {
        setCredentials([]);
      }
    } catch {
      setCredentials([]);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetchApi(`/api/participants/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: form }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Update local state
      setTenants((prev) =>
        prev.map((t) =>
          t.id === selected.id
            ? { ...t, properties: { ...t.properties, ...form } }
            : t,
        ),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading settings…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Participant Settings"
          icon={Settings2}
          description="Manage your participant profile and preferences. Update display name, contact details, and notification settings for your registered dataspace identity."
          prevStep={{ href: "/admin/audit", label: "Audit & Provenance" }}
          infoText="Changes are saved to the tenant-manager API and reflected across all dataspace interactions. Your DID:web identity and credentials remain unchanged."
          docLink={{ href: "/docs/user-guide", label: "User Guide" }}
        />

        {tenants.length === 0 ? (
          <div className="text-center py-12">
            <Settings2 size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-[var(--text-secondary)] mb-2">
              No participant profile found
            </p>
            <a
              href="/onboarding"
              className="text-sm text-layer2 hover:underline"
            >
              Register first →
            </a>
          </div>
        ) : (
          <>
            {/* Tenant selector */}
            <div className="mb-6">
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                Active Profile
              </label>
              <select
                value={selected?.id || ""}
                onChange={(e) => handleSelect(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.properties.displayName || t.id}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="border border-[var(--border)] rounded-xl divide-y divide-gray-700">
                {/* Identity (read-only) */}
                <div className="p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <User size={16} className="text-layer2" />
                    Identity
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)]">
                        EHDS Role
                      </label>
                      <p className="text-sm font-medium text-gray-200 mt-0.5">
                        {selected.properties.ehdsParticipantType ||
                          selected.properties.role ||
                          "—"}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)]">
                        Tenant ID
                      </label>
                      <p className="font-mono text-xs text-[var(--text-secondary)] break-all mt-0.5">
                        {selected.id}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Editable contact & organisation fields */}
                <div className="p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Settings2 size={16} className="text-layer2" />
                    Profile &amp; Contact Details
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        {
                          key: "displayName",
                          label: "Display Name",
                          icon: User,
                          placeholder: "e.g. AlphaKlinik Berlin",
                        },
                        {
                          key: "organization",
                          label: "Organisation",
                          icon: Settings2,
                          placeholder: "Legal entity name",
                        },
                        {
                          key: "contactPerson",
                          label: "Contact Person",
                          icon: User,
                          placeholder: "Full name",
                        },
                        {
                          key: "email",
                          label: "Email",
                          icon: Mail,
                          placeholder: "contact@example.de",
                          type: "email",
                        },
                        {
                          key: "phone",
                          label: "Phone",
                          icon: Phone,
                          placeholder: "+49 30 …",
                          type: "tel",
                        },
                        {
                          key: "website",
                          label: "Website",
                          icon: Globe,
                          placeholder: "https://",
                          type: "url",
                        },
                        {
                          key: "address",
                          label: "Street Address",
                          icon: MapPin,
                          placeholder: "Street & number",
                        },
                        {
                          key: "city",
                          label: "City",
                          icon: MapPin,
                          placeholder: "Berlin",
                        },
                        {
                          key: "postalCode",
                          label: "Postal Code",
                          icon: MapPin,
                          placeholder: "10117",
                        },
                        {
                          key: "country",
                          label: "Country",
                          icon: Globe,
                          placeholder: "DE",
                        },
                      ] as {
                        key: keyof typeof form;
                        label: string;
                        icon: ElementType;
                        placeholder: string;
                        type?: string;
                      }[]
                    ).map(({ key, label, icon: Icon, placeholder, type }) => (
                      <div key={key}>
                        <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                          <Icon size={11} />
                          {label}
                        </label>
                        <input
                          type={type || "text"}
                          value={form[key]}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, [key]: e.target.value }))
                          }
                          placeholder={placeholder}
                          className="w-full px-3 py-1.5 bg-[var(--surface-2)] border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-layer2"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dataspace Profiles */}
                <div className="p-6">
                  <h2 className="font-semibold mb-3">Dataspace Profiles</h2>
                  {selected.participantProfiles?.length > 0 ? (
                    <div className="space-y-3">
                      {selected.participantProfiles.map((pp, i) => {
                        const ctxId =
                          pp.properties?.["cfm.vpa.state"]
                            ?.participantContextId || "—";
                        const did = pp.identifier
                          ? decodeURIComponent(pp.identifier)
                          : "—";
                        const allDisposed =
                          pp.vpas?.length &&
                          pp.vpas.every((v) => v.state === "disposed");
                        const hasError = pp.error && !allDisposed;
                        const activeVpas =
                          pp.vpas?.filter((v) => v.state === "active") || [];
                        return (
                          <div
                            key={pp.id || i}
                            className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                              hasError
                                ? "bg-red-950/30 border-red-800/50"
                                : allDisposed
                                  ? "bg-yellow-950/20 border-yellow-800/40"
                                  : "bg-[var(--surface-2)]/50 border-[var(--border)]"
                            }`}
                          >
                            {hasError && (
                              <div className="flex items-center gap-1.5 text-red-400 mb-1">
                                <AlertCircle size={12} />
                                <span>Provisioning failed</span>
                              </div>
                            )}
                            {allDisposed && (
                              <div className="flex items-center gap-1.5 text-yellow-500 mb-1">
                                <AlertCircle size={12} />
                                <span>
                                  VPAs disposed — re-run{" "}
                                  <code className="font-mono bg-yellow-900/30 px-1 rounded">
                                    seed-health-tenants.sh
                                  </code>{" "}
                                  to re-provision
                                </span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <span className="text-[var(--text-secondary)] w-32 shrink-0">
                                Profile ID
                              </span>
                              <span className="text-[var(--text-primary)] font-mono break-all">
                                {pp.id}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-[var(--text-secondary)] w-32 shrink-0">
                                DID
                              </span>
                              <span className="text-[var(--text-primary)] font-mono break-all">
                                {did}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-[var(--text-secondary)] w-32 shrink-0">
                                Participant Ctx
                              </span>
                              <span className="text-[var(--text-primary)] font-mono">
                                {ctxId !== "—" ? (
                                  ctxId
                                ) : (
                                  <span className="text-gray-600">none</span>
                                )}
                              </span>
                            </div>
                            {activeVpas.length > 0 && (
                              <div className="flex gap-2">
                                <span className="text-[var(--text-secondary)] w-32 shrink-0">
                                  Active VPAs
                                </span>
                                <span className="text-green-400">
                                  {activeVpas
                                    .map((v) => v.type.replace("cfm.", ""))
                                    .join(", ")}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[var(--text-secondary)] text-sm">
                      No dataspace profiles linked yet.
                    </p>
                  )}
                </div>

                {/* Digital Credentials (VCs) */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold flex items-center gap-2">
                      <ShieldCheck size={16} className="text-layer2" />
                      Digital Credentials
                    </h2>
                    <button
                      onClick={() => selected && loadCredentials(selected.id)}
                      disabled={credsLoading}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 disabled:opacity-40"
                    >
                      <RefreshCw
                        size={11}
                        className={credsLoading ? "animate-spin" : ""}
                      />
                      Refresh
                    </button>
                  </div>

                  {credsLoading ? (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
                      <Loader2 size={13} className="animate-spin" />
                      Fetching credentials…
                    </div>
                  ) : credentials.length === 0 ||
                    credentials.every((c) => c.credentials.length === 0) ? (
                    <div className="rounded-lg bg-[var(--surface-2)]/40 border border-[var(--border)] p-4 text-sm">
                      <div className="flex items-center gap-2 text-yellow-500 mb-2">
                        <ShieldOff size={14} />
                        <span className="font-medium">
                          No credentials issued yet
                        </span>
                      </div>
                      <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                        Verifiable Credentials (EHDS-compliant VCs) are issued
                        by the HDAB after participant onboarding via the
                        IdentityHub. To issue credentials, run:
                      </p>
                      <code className="mt-2 block text-xs text-green-400/80 bg-[var(--surface)] rounded px-3 py-2">
                        bash jad/issue-ehds-credentials.sh
                      </code>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {credentials.flatMap((ctx) =>
                        ctx.credentials.map((vc, i) => {
                          const types = (vc.type || []).filter(
                            (t) => t !== "VerifiableCredential",
                          );
                          const expired =
                            vc.expirationDate &&
                            new Date(vc.expirationDate) < new Date();
                          return (
                            <div
                              key={`${ctx.profileId}-${i}`}
                              className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                                expired
                                  ? "bg-red-950/30 border-red-800/50"
                                  : "bg-green-950/20 border-green-800/40"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                {expired ? (
                                  <ShieldOff
                                    size={12}
                                    className="text-red-400"
                                  />
                                ) : (
                                  <ShieldCheck
                                    size={12}
                                    className="text-green-400"
                                  />
                                )}
                                <span
                                  className={
                                    expired ? "text-red-400" : "text-green-400"
                                  }
                                >
                                  {types.join(", ") || "VerifiableCredential"}
                                </span>
                                {expired && (
                                  <span className="text-red-500 ml-auto">
                                    EXPIRED
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <span className="text-[var(--text-secondary)] w-28 shrink-0">
                                  Issuer
                                </span>
                                <span className="text-[var(--text-primary)] font-mono break-all">
                                  {vc.issuer || "—"}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-[var(--text-secondary)] w-28 shrink-0">
                                  Issued
                                </span>
                                <span className="text-[var(--text-primary)]">
                                  {vc.issuanceDate
                                    ? new Date(
                                        vc.issuanceDate,
                                      ).toLocaleDateString()
                                    : "—"}
                                </span>
                              </div>
                              {vc.expirationDate && (
                                <div className="flex gap-2">
                                  <span className="text-[var(--text-secondary)] w-28 shrink-0">
                                    Expires
                                  </span>
                                  <span
                                    className={
                                      expired
                                        ? "text-red-400"
                                        : "text-[var(--text-primary)]"
                                    }
                                  >
                                    {new Date(
                                      vc.expirationDate,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              {vc.id && (
                                <div className="flex gap-2">
                                  <span className="text-[var(--text-secondary)] w-28 shrink-0">
                                    Credential ID
                                  </span>
                                  <span className="text-[var(--text-secondary)] font-mono text-[10px] break-all">
                                    {vc.id}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        }),
                      )}
                    </div>
                  )}
                </div>

                {/* Save */}
                <div className="p-6 flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-layer2 text-white rounded-lg text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving…
                      </>
                    ) : saved ? (
                      <>
                        <CheckCircle2 size={16} />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save Changes
                      </>
                    )}
                  </button>
                  {saveError && (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {saveError}
                    </span>
                  )}
                  {saved && !saveError && (
                    <span className="text-xs text-green-500">
                      Profile saved successfully.
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
