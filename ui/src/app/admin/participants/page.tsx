"use client";

import { fetchApi } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import PageIntro from "@/components/PageIntro";
import { Globe, Loader2, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";

interface Participant {
  participantId: string;
  name: string | null;
  participantType: string | null;
  source: string | null;
  walletType: string | null;
  country: string | null;
  dspCatalogUrl: string | null;
  crawlerEnabled: boolean | null;
  onboardedAt: string | null;
  datasetCount: number;
}

interface DirectoryResponse {
  participants: Participant[];
  summary: {
    total: number;
    crawlable: number;
    bySource: Record<string, number>;
  };
}

const SOURCE_BADGE: Record<string, string> = {
  seed: "bg-blue-900/40 text-blue-300 border-blue-700",
  dcp: "bg-purple-900/40 text-purple-300 border-purple-700",
  "business-wallet": "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  "private-wallet": "bg-amber-900/40 text-amber-300 border-amber-700",
};

const EMPTY_FORM = {
  participantId: "",
  name: "",
  participantType: "DATA_HOLDER",
  walletType: "business",
  source: "business-wallet",
  country: "",
  dspCatalogUrl: "",
};

export default function ParticipantsAdminPage() {
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi("/api/admin/participants");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load participants",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetchApi("/api/admin/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(body.error ?? `HTTP ${res.status}`);
      } else {
        setNotice(`Added ${form.participantId}`);
        setForm(EMPTY_FORM);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeParticipant(participantId: string) {
    setNotice(null);
    const res = await fetchApi(
      `/api/admin/participants?id=${encodeURIComponent(participantId)}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(body.error ?? `HTTP ${res.status}`);
    } else {
      setNotice(`Removed ${participantId}`);
      await load();
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <PageIntro
          title="Participant Directory"
          icon={Globe}
          description="Wallets and participants the catalog crawler discovers datasets from. Adding a participant here makes their DSP catalog a crawl target on the next 5-minute tick — no restart required."
          infoText="source shows how the participant entered the directory: seed (demo bootstrap), dcp (trust-anchor discovery), business-wallet / private-wallet (manual onboarding). Only entries with a DSP catalog URL and crawling enabled are fetched."
        />

        {notice && (
          <div
            role="status"
            className="mb-4 rounded border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-primary)]"
          >
            {notice}
          </div>
        )}

        {/* Summary row */}
        {data && (
          <div
            className="mb-6 flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]"
            data-testid="participants-summary"
          >
            <span>{data.summary.total} participants</span>
            <span>·</span>
            <span>{data.summary.crawlable} crawlable</span>
            {Object.entries(data.summary.bySource).map(([s, n]) => (
              <span key={s} className="flex items-center gap-1">
                · {s}: {n}
              </span>
            ))}
            <button
              onClick={load}
              aria-label="Refresh participants"
              className="ml-auto flex items-center gap-1 text-[var(--accent)] hover:underline"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-8 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" /> Loading participant
            directory…
          </div>
        )}
        {error && !loading && (
          <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Directory table */}
        {data && !loading && (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm" data-testid="participants-table">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-[var(--text-secondary)]">
                  <th className="px-4 py-3 font-medium">Participant</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Wallet</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium">Datasets</th>
                  <th className="px-4 py-3 font-medium">DSP Catalog</th>
                  <th className="px-4 py-3 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr
                    key={p.participantId}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {p.name ?? "—"}
                      </div>
                      <div className="font-mono text-xs text-[var(--text-secondary)]">
                        {p.participantId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs ${
                          SOURCE_BADGE[p.source ?? ""] ??
                          "bg-gray-800 text-gray-300 border-gray-600"
                        }`}
                      >
                        {p.source ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Wallet size={13} /> {p.walletType ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {p.country ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {p.datasetCount}
                    </td>
                    <td className="px-4 py-3">
                      {p.dspCatalogUrl ? (
                        <span
                          className={`font-mono text-xs ${
                            p.crawlerEnabled
                              ? "text-[var(--text-secondary)]"
                              : "text-[var(--text-secondary)] line-through"
                          }`}
                          title={
                            p.crawlerEnabled
                              ? "Crawled every 5 minutes"
                              : "Crawling disabled"
                          }
                        >
                          {p.dspCatalogUrl}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">
                          not crawlable
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.source !== "seed" && (
                        <button
                          onClick={() => removeParticipant(p.participantId)}
                          aria-label={`Remove ${p.name ?? p.participantId}`}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Onboard form */}
        <form
          onSubmit={addParticipant}
          className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-6"
          data-testid="participant-form"
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
            <Plus size={18} /> Onboard participant wallet
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm text-[var(--text-secondary)]">
              Participant DID *
              <input
                required
                value={form.participantId}
                onChange={(e) =>
                  setForm({ ...form, participantId: e.target.value })
                }
                placeholder="did:web:clinic.example:participant"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
              />
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Display name *
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Fictional Clinic GmbH"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Participant type
              <select
                value={form.participantType}
                onChange={(e) =>
                  setForm({ ...form, participantType: e.target.value })
                }
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)]"
              >
                <option>DATA_HOLDER</option>
                <option>DATA_USER</option>
                <option>HDAB</option>
              </select>
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Wallet type
              <select
                value={form.walletType}
                onChange={(e) =>
                  setForm({ ...form, walletType: e.target.value })
                }
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)]"
              >
                <option value="business">business</option>
                <option value="private">private</option>
              </select>
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Country (ISO-2)
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="DE"
                maxLength={2}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              DSP catalog URL
              <input
                value={form.dspCatalogUrl}
                onChange={(e) =>
                  setForm({ ...form, dspCatalogUrl: e.target.value })
                }
                placeholder="https://clinic.example/api/dsp/catalog"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 dark:text-gray-900"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Plus size={15} />
            )}
            Add to directory
          </button>
        </form>
      </div>
    </div>
  );
}
