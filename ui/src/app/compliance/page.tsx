"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, AlertCircle } from "lucide-react";

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

export default function CompliancePage() {
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [consumerId, setConsumerId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Load dropdown options from graph on mount
  useEffect(() => {
    fetch("/api/compliance")
      .then((r) => r.json())
      .then((d) => {
        setConsumers(d.consumers ?? []);
        setDatasets(d.datasets ?? []);
        if ((d.consumers ?? []).length > 0) setConsumerId(d.consumers[0].id);
        if ((d.datasets ?? []).length > 0) setDatasetId(d.datasets[0].id);
        setOptionsLoading(false);
      })
      .catch(() => setOptionsLoading(false));
  }, []);

  const check = async () => {
    if (!consumerId || !datasetId) return;
    setLoading(true);
    const r = await fetch(
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
      <h1 className="text-2xl font-bold mb-1">EHDS Compliance Checker</h1>
      <p className="text-gray-400 text-sm mb-8">
        Validate HDAB approval chain — Articles 45–53
      </p>

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
    </div>
  );
}
