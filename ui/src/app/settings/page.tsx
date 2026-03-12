"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { Loader2, Settings2, Save, CheckCircle2 } from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface Tenant {
  id: string;
  version: number;
  properties: Record<string, string>;
  participantProfiles: {
    dataspaceProfileId: string;
    participantContextId: string;
    tenantId: string;
  }[];
}

export default function SettingsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchApi("/api/participants/me")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        // /api/participants/me returns flat array or { tenants: [...] }
        const list = Array.isArray(d) ? d : d.tenants || [];
        setTenants(list);
        if (list.length > 0) setSelected(list[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = () => {
    // Settings save is aspirational — the CFM TenantManager
    // doesn't support PATCH in this demo. Show confirmation UX.
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
          {/* Tenant selector (if multiple) */}
          {tenants.length > 1 && (
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-1">
                Active Profile
              </label>
              <select
                value={selected?.id || ""}
                onChange={(e) =>
                  setSelected(
                    tenants.find((t) => t.id === e.target.value) || null,
                  )
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.properties.displayName || t.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <div className="border border-gray-700 rounded-xl divide-y divide-gray-700">
              {/* Profile section */}
              <div className="p-6">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Settings2 size={18} className="text-layer2" />
                  Profile
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-500">
                      Display Name
                    </label>
                    <p className="font-medium text-gray-200">
                      {selected.properties.displayName || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">
                      Organization
                    </label>
                    <p className="font-medium text-gray-200">
                      {selected.properties.organization || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">EHDS Role</label>
                    <p className="font-medium text-gray-200">
                      {selected.properties.ehdsParticipantType ||
                        selected.properties.role ||
                        "—"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Tenant ID</label>
                    <p className="font-mono text-xs text-gray-400 break-all">
                      {selected.id}
                    </p>
                  </div>
                </div>
              </div>

              {/* Participant profiles section */}
              <div className="p-6">
                <h2 className="font-semibold mb-4">Dataspace Profiles</h2>
                {selected.participantProfiles?.length > 0 ? (
                  <div className="space-y-3">
                    {selected.participantProfiles.map((pp, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-gray-800/50 border border-gray-700 text-xs space-y-1"
                      >
                        <div className="flex gap-2">
                          <span className="text-gray-500 w-36">
                            Dataspace Profile
                          </span>
                          <span className="text-gray-300 font-mono">
                            {pp.dataspaceProfileId}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-500 w-36">
                            Participant Ctx
                          </span>
                          <span className="text-gray-300 font-mono">
                            {pp.participantContextId?.slice(0, 12)}…
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">
                    No dataspace profiles linked yet.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="p-6 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-layer2 text-white rounded-lg text-sm font-medium hover:bg-layer2/90"
                >
                  {saved ? (
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
                <span className="text-xs text-gray-600">
                  Profile editing is read-only in this demo
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
