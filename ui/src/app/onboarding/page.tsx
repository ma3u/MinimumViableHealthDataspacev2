"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

interface ParticipantProfile {
  dataspaceProfileId: string;
  participantContextId: string;
  tenantId: string;
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

type Step = "form" | "submitting" | "done";

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

export default function OnboardingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("data-holder");

  useEffect(() => {
    fetchApi("/api/participants/me")
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.tenants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

      // Refresh tenant list
      const updated = await fetchApi("/api/participants/me");
      const data = await updated.json();
      setTenants(data.tenants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStep("form");
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Participant Onboarding</h1>
      <p className="text-gray-400 text-sm mb-8">
        Register your organization in the EHDS Health Dataspace
      </p>

      {/* Existing registrations */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 mb-8">
          <Loader2 size={16} className="animate-spin" />
          Loading existing registrations…
        </div>
      ) : tenants.length > 0 ? (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Registered Participants
          </h2>
          <div className="grid gap-3">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-gray-700 bg-gray-900/50"
              >
                <Building2 size={20} className="text-layer2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-100">
                    {t.properties.displayName || t.id}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.properties.organization} · {t.properties.role} ·{" "}
                    {t.participantProfiles?.length || 0} profile(s)
                  </p>
                </div>
                <a
                  href={`/onboarding/status?tenantId=${t.id}`}
                  className="flex items-center gap-1 text-xs text-layer2 hover:underline"
                >
                  View status <ChevronRight size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Registration form */}
      {step === "done" ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 size={48} className="text-green-400" />
          <h2 className="text-xl font-semibold">Registration Submitted</h2>
          <p className="text-gray-400 text-sm max-w-md">
            Your participant context has been created. DID provisioning and
            credential issuance will follow automatically.
          </p>
          <a
            href="/onboarding/status"
            className="mt-4 px-4 py-2 bg-layer2 text-white rounded-lg text-sm hover:bg-layer2/90"
          >
            Check Onboarding Status
          </a>
        </div>
      ) : (
        <div className="border border-gray-700 rounded-xl p-6">
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
              <label className="block text-sm text-gray-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. University Hospital Berlin"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Organization
              </label>
              <input
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Charité – Universitätsmedizin Berlin"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                EHDS Role
              </label>
              <div className="grid gap-2">
                {EHDS_ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      role === r.value
                        ? "border-layer2 bg-layer2/10"
                        : "border-gray-700 hover:border-gray-500"
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
                      <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
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
    </div>
  );
}
