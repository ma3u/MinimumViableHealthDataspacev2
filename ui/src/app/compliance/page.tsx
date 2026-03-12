"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertCircle, BadgeCheck, Key } from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface Consumer {
  id: string;
  name: string;
  type: string;
}

interface DatasetOption {
  id: string;
  title: string;
}

interface ChainEntry {
  consumer: string;
  applicationId: string;
  applicationStatus: string;
  approvalId: string;
  approvalStatus: string;
  ehdsArticle: string;
  dataset: string;
  contract: string;
}

interface Result {
  compliant: boolean;
  chain: ChainEntry[];
}

interface Credential {
  credentialId: string;
  credentialType: string;
  subjectDid: string;
  issuerDid: string;
  status: string;
  participantRole: string | null;
  holderName: string | null;
  holderType: string | null;
  issuedAt: string;
  expiresAt: string;
  purpose: string | null;
  datasetId: string | null;
  completeness: number | null;
  conformance: number | null;
  timeliness: number | null;
}

export default function CompliancePage() {
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [consumerId, setConsumerId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Load dropdown options and credentials on mount
  useEffect(() => {
    Promise.all([
      fetchApi("/api/compliance")
        .then((r) => r.json())
        .then((d) => {
          setConsumers(d.consumers ?? []);
          setDatasets(d.datasets ?? []);
          if ((d.consumers ?? []).length > 0) setConsumerId(d.consumers[0].id);
          if ((d.datasets ?? []).length > 0) setDatasetId(d.datasets[0].id);
        }),
      fetchApi("/api/credentials")
        .then((r) => r.json())
        .then((d) => setCredentials(d.credentials ?? []))
        .catch(() => {}),
    ]).finally(() => setOptionsLoading(false));
  }, []);

  const check = async () => {
    if (!consumerId || !datasetId) return;
    setLoading(true);
    const r = await fetchApi(
      `/api/compliance?consumerId=${encodeURIComponent(
        consumerId,
      )}&datasetId=${encodeURIComponent(datasetId)}`,
    );
    const data = await r.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <PageIntro
        title="EHDS Compliance Checker"
        icon={ShieldCheck}
        description="Validate the HDAB approval chain for data access permits under EHDS Articles 45–53. Select a consumer and dataset to check whether all required Verifiable Credentials and HDAB approvals are in place."
        prevStep={{ href: "/eehrxf", label: "EEHRxF Profiles" }}
        nextStep={{ href: "/compliance/tck", label: "Protocol TCK" }}
        infoText="The checker verifies DID:web identities, EHDS credentials, and the complete approval chain in Neo4j. A green result means the participant meets all regulatory requirements for secondary-use data access."
        docLink={{ href: "/docs/architecture", label: "Architecture Docs" }}
      />

      <div className="flex flex-col gap-3 mb-6">
        <label className="text-sm text-gray-400">
          Consumer (Participant)
          {optionsLoading ? (
            <div className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-500">
              Loading from graph…
            </div>
          ) : consumers.length > 0 ? (
            <select
              value={consumerId}
              onChange={(e) => setConsumerId(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer5 block"
            >
              <option value="">— select consumer —</option>
              {consumers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} [{c.type}]
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={consumerId}
              onChange={(e) => setConsumerId(e.target.value)}
              placeholder="Participant ID or DID"
              className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer5 block"
            />
          )}
        </label>

        <label className="text-sm text-gray-400">
          Dataset
          {optionsLoading ? (
            <div className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-500">
              Loading from graph…
            </div>
          ) : datasets.length > 0 ? (
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer5 block"
            >
              <option value="">— select dataset —</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              placeholder="Dataset ID"
              className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer5 block"
            />
          )}
        </label>

        <button
          onClick={check}
          disabled={loading || !consumerId || !datasetId}
          className="mt-2 px-4 py-2 bg-layer5 hover:bg-layer5-dark rounded font-medium text-sm disabled:opacity-50"
        >
          {loading ? "Checking…" : "Validate Compliance"}
        </button>
      </div>

      {result && (
        <div
          className={`rounded-xl p-4 border ${
            result.compliant
              ? "border-layer3 bg-layer3/10"
              : "border-red-600 bg-red-900/10"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold mb-3">
            {result.compliant ? (
              <>
                <ShieldCheck size={18} className="text-layer3" />
                <span className="text-layer3">
                  Compliant — full HDAB chain found
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={18} className="text-red-400" />
                <span className="text-red-400">
                  Non-compliant — no approval chain found
                </span>
              </>
            )}
          </div>

          {result.chain.length > 0 && (
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left pb-1">Application</th>
                  <th className="text-left pb-1">Status</th>
                  <th className="text-left pb-1">Approval</th>
                  <th className="text-left pb-1">EHDS Article</th>
                  <th className="text-left pb-1">Contract</th>
                </tr>
              </thead>
              <tbody>
                {result.chain.map((c, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-1 pr-2 font-mono">{c.applicationId}</td>
                    <td className="py-1 pr-2 text-green-400">
                      {c.applicationStatus}
                    </td>
                    <td className="py-1 pr-2 font-mono">{c.approvalId}</td>
                    <td className="py-1 pr-2">{c.ehdsArticle}</td>
                    <td className="py-1 font-mono text-gray-400">
                      {c.contract ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Verifiable Credentials Trust Section ── */}
      <div className="mt-12 border-t border-gray-700 pt-8">
        <div className="flex items-center gap-2 mb-1">
          <Key size={18} className="text-layer1" />
          <h2 className="text-xl font-bold">EHDS Verifiable Credentials</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          DCP credential definitions registered on IssuerService — presented
          during DSP negotiation
        </p>

        {credentials.length === 0 ? (
          <div className="text-gray-500 text-sm">
            {optionsLoading ? "Loading…" : "No credentials found in graph."}
          </div>
        ) : (
          <div className="space-y-4">
            {credentials.map((vc) => (
              <div
                key={vc.credentialId}
                className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BadgeCheck
                      size={16}
                      className={
                        vc.status === "active"
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    />
                    <span className="font-semibold text-sm">
                      {vc.credentialType}
                    </span>
                    {vc.participantRole && (
                      <span className="text-xs px-2 py-0.5 rounded bg-layer5/20 text-layer5">
                        {vc.participantRole}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      vc.status === "active"
                        ? "bg-green-900/40 text-green-400"
                        : "bg-red-900/40 text-red-400"
                    }`}
                  >
                    {vc.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                  <div>
                    <span className="text-gray-500">Holder:</span>{" "}
                    {vc.holderName ?? "—"}
                    {vc.holderType && (
                      <span className="text-gray-600"> [{vc.holderType}]</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">Subject:</span>{" "}
                    <span className="font-mono">
                      {vc.subjectDid?.replace(
                        /did:web:identityhub%3A7083:/,
                        "",
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Issuer:</span>{" "}
                    <span className="font-mono">
                      {vc.issuerDid?.replace(
                        /did:web:issuerservice%3A10016:/,
                        "",
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Format:</span> VC1_0_JWT
                  </div>

                  {/* Type-specific details */}
                  {vc.purpose && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Purpose:</span>{" "}
                      {vc.purpose}
                    </div>
                  )}
                  {vc.datasetId && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Dataset:</span>{" "}
                      <span className="font-mono">{vc.datasetId}</span>
                    </div>
                  )}
                  {vc.completeness != null && (
                    <div className="col-span-2 mt-1">
                      <span className="text-gray-500">Quality:</span>{" "}
                      Completeness{" "}
                      <span className="text-green-400">
                        {(vc.completeness * 100).toFixed(0)}%
                      </span>
                      {" · "}Conformance{" "}
                      <span className="text-green-400">
                        {((vc.conformance ?? 0) * 100).toFixed(0)}%
                      </span>
                      {" · "}Timeliness{" "}
                      <span className="text-green-400">
                        {((vc.timeliness ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trust chain diagram */}
        <div className="mt-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-300">
            DCP Trust Chain — Credential Presentation Flow
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
            <span className="px-2 py-1 rounded bg-layer1/20 text-layer1 font-medium">
              IssuerService
            </span>
            <span>→ signs VC →</span>
            <span className="px-2 py-1 rounded bg-layer2/20 text-layer2 font-medium">
              IdentityHub
            </span>
            <span>→ stores →</span>
            <span className="px-2 py-1 rounded bg-layer3/20 text-layer3 font-medium">
              DCP Presentation
            </span>
            <span>→ verifies →</span>
            <span className="px-2 py-1 rounded bg-layer5/20 text-layer5 font-medium">
              Policy Engine
            </span>
            <span>→ evaluates →</span>
            <span className="px-2 py-1 rounded bg-green-900/40 text-green-400 font-medium">
              ✓ Access Granted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
