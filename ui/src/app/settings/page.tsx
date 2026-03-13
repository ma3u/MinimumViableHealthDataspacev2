"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, type ElementType } from "react";
import { Loader2, Settings2, Save, CheckCircle2, AlertCircle, User, Globe, Phone, Mail, MapPin } from "lucide-react";
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

export default function SettingsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Editable contact field state — seeded from tenant properties
  const [form, setForm] = useState({
    displayName: "",
    organization: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    city: "",
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
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
      country: p.country || "",
      website: p.website || "",
    });
  }

  function handleSelect(id: string) {
    const t = tenants.find((t) => t.id === id) || null;
    setSelected(t);
    if (t) seedForm(t);
    setSaved(false);
    setSaveError("");
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
            : t
        )
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
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading settings…
        </div>
      </div>
    );
  }

  return (
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
          <p className="text-gray-400 mb-2">No participant profile found</p>
          <a href="/onboarding" className="text-sm text-layer2 hover:underline">
            Register first →
          </a>
        </div>
      ) : (
        <>
          {/* Tenant selector */}
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-1">Active Profile</label>
            <select
              value={selected?.id || ""}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.properties.displayName || t.id}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="border border-gray-700 rounded-xl divide-y divide-gray-700">

              {/* Identity (read-only) */}
              <div className="p-6">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <User size={16} className="text-layer2" />
                  Identity
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-500">EHDS Role</label>
                    <p className="text-sm font-medium text-gray-200 mt-0.5">
                      {selected.properties.ehdsParticipantType ||
                        selected.properties.role || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Tenant ID</label>
                    <p className="font-mono text-xs text-gray-400 break-all mt-0.5">
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
                  {([
                    { key: "displayName", label: "Display Name", icon: User, placeholder: "e.g. AlphaKlinik Berlin" },
                    { key: "organization", label: "Organisation", icon: Settings2, placeholder: "Legal entity name" },
                    { key: "contactPerson", label: "Contact Person", icon: User, placeholder: "Full name" },
                    { key: "email", label: "Email", icon: Mail, placeholder: "contact@example.de", type: "email" },
                    { key: "phone", label: "Phone", icon: Phone, placeholder: "+49 30 …", type: "tel" },
                    { key: "website", label: "Website", icon: Globe, placeholder: "https://", type: "url" },
                    { key: "address", label: "Street Address", icon: MapPin, placeholder: "Street & number" },
                    { key: "city", label: "City", icon: MapPin, placeholder: "Berlin" },
                    { key: "country", label: "Country", icon: Globe, placeholder: "DE" },
                  ] as { key: keyof typeof form; label: string; icon: ElementType; placeholder: string; type?: string }[]).map(
                    ({ key, label, icon: Icon, placeholder, type }) => (
                      <div key={key}>
                        <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                          <Icon size={11} />
                          {label}
                        </label>
                        <input
                          type={type || "text"}
                          value={form[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-layer2"
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Dataspace Profiles (read-only, corrected field mapping) */}
              <div className="p-6">
                <h2 className="font-semibold mb-3">Dataspace Profiles</h2>
                {selected.participantProfiles?.length > 0 ? (
                  <div className="space-y-3">
                    {selected.participantProfiles.map((pp, i) => {
                      const ctxId =
                        pp.properties?.["cfm.vpa.state"]?.participantContextId ||
                        "—";
                      const did = pp.identifier || "—";
                      const activeVpas = pp.vpas?.filter((v) => v.state !== "disposed") || [];
                      return (
                        <div
                          key={pp.id || i}
                          className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                            pp.error
                              ? "bg-red-950/30 border-red-800/50"
                              : "bg-gray-800/50 border-gray-700"
                          }`}
                        >
                          {pp.error && (
                            <div className="flex items-center gap-1 text-red-400 mb-1">
                              <AlertCircle size={12} />
                              <span>VPA provisioning incomplete</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-32 shrink-0">Profile ID</span>
                            <span className="text-gray-300 font-mono break-all">{pp.id}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-32 shrink-0">DID</span>
                            <span className="text-gray-300 font-mono break-all">
                              {decodeURIComponent(did)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-32 shrink-0">Participant Ctx</span>
                            <span className="text-gray-300 font-mono">
                              {ctxId !== "—" ? ctxId.slice(0, 16) + "…" : "—"}
                            </span>
                          </div>
                          {activeVpas.length > 0 && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-32 shrink-0">Active VPAs</span>
                              <span className="text-green-400">
                                {activeVpas.map((v) => v.type.replace("cfm.", "")).join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No dataspace profiles linked yet.</p>
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
                    <><Loader2 size={16} className="animate-spin" />Saving…</>
                  ) : saved ? (
                    <><CheckCircle2 size={16} />Saved</>
                  ) : (
                    <><Save size={16} />Save Changes</>
                  )}
                </button>
                {saveError && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} />{saveError}
                  </span>
                )}
                {saved && !saveError && (
                  <span className="text-xs text-green-500">Profile saved successfully.</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
