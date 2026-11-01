"use client";

import { fetchApi } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import PageIntro from "@/components/PageIntro";
import { Globe, Loader2, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";
import { useT } from "@/lib/i18n/translate";

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

// Light and dark variants: the dark-only classes left "seed" light blue on
// blue in the light theme, unreadable.
const SOURCE_BADGE: Record<string, string> = {
  seed: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  dcp: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  "business-wallet":
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
  "private-wallet":
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
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
  const t = useT("admin");
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The row whose delete waits for a second click.
  const [confirming, setConfirming] = useState<string | null>(null);

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
        setNotice(t("Added {id}", { id: form.participantId }));
        setForm(EMPTY_FORM);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeParticipant(participantId: string) {
    setConfirming(null);
    setNotice(null);
    const res = await fetchApi(
      `/api/admin/participants?id=${encodeURIComponent(participantId)}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(body.error ?? `HTTP ${res.status}`);
    } else {
      setNotice(
        body.returnsOnDeploy
          ? t("Removed {id}. It is seeded, so the next deploy adds it back.", {
              id: participantId,
            })
          : t("Removed {id}", { id: participantId }),
      );
      await load();
    }
  }

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <PageIntro
          title={t("Participant Directory")}
          icon={Globe}
          description={t(
            "Wallets and participants the catalog crawler discovers datasets from. Adding a participant here makes their DSP catalog a crawl target on the next 5-minute tick; no restart required.",
          )}
          infoText={t(
            "source shows how the participant entered the directory: seed (demo bootstrap), dcp (trust-anchor discovery), business-wallet / private-wallet (manual onboarding). Only entries with a DSP catalog URL and crawling enabled are fetched.",
          )}
        />

        {notice && (
          <div
            role="status"
            className="mb-4 rounded-sm border border-(--border) bg-(--surface-2) px-4 py-2 text-sm text-(--text-primary)"
          >
            {notice}
          </div>
        )}

        {/* Summary row */}
        {data && (
          <div
            className="mb-6 flex flex-wrap gap-4 text-sm text-(--text-secondary)"
            data-testid="participants-summary"
          >
            <span>{t("{n} participants", { n: data.summary.total })}</span>
            <span>·</span>
            <span>{t("{n} crawlable", { n: data.summary.crawlable })}</span>
            {Object.entries(data.summary.bySource).map(([s, n]) => (
              <span key={s} className="flex items-center gap-1">
                · {s}: {n}
              </span>
            ))}
            <button
              onClick={load}
              aria-label={t("Refresh participants")}
              className="ml-auto flex items-center gap-1 text-(--accent) hover:underline"
            >
              <RefreshCw size={14} /> {t("Refresh")}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-8 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />{" "}
            {t("Loading participant directory…")}
          </div>
        )}
        {error && !loading && (
          <div className="rounded-sm border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {t(error)}
          </div>
        )}

        {/* Directory table */}
        {data && !loading && (
          <div className="overflow-x-auto rounded-lg border border-(--border)">
            <table className="w-full text-sm" data-testid="participants-table">
              <thead>
                <tr className="border-b border-(--border) bg-(--surface-2) text-left text-(--text-secondary)">
                  <th className="px-4 py-3 font-medium">{t("Participant")}</th>
                  <th className="px-4 py-3 font-medium">{t("Source")}</th>
                  <th className="px-4 py-3 font-medium">{t("Wallet")}</th>
                  <th className="px-4 py-3 font-medium">{t("Country")}</th>
                  <th className="px-4 py-3 font-medium">{t("Datasets")}</th>
                  <th className="px-4 py-3 font-medium">{t("DSP Catalog")}</th>
                  <th className="px-4 py-3 font-medium sr-only">
                    {t("Actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr
                    key={p.participantId}
                    className="border-b border-(--border) last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-(--text-primary)">
                        {p.name ?? "—"}
                      </div>
                      <div className="font-mono text-xs text-(--text-secondary)">
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
                        {p.source ?? t("unknown")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--text-secondary)">
                      <span className="flex items-center gap-1">
                        <Wallet size={13} /> {p.walletType ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--text-secondary)">
                      {p.country ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-(--text-secondary)">
                      {p.datasetCount}
                    </td>
                    <td className="px-4 py-3">
                      {p.dspCatalogUrl ? (
                        <span
                          className={`font-mono text-xs ${
                            p.crawlerEnabled
                              ? "text-(--text-secondary)"
                              : "text-(--text-secondary) line-through"
                          }`}
                          title={
                            p.crawlerEnabled
                              ? t("Crawled every 5 minutes")
                              : t("Crawling disabled")
                          }
                        >
                          {p.dspCatalogUrl}
                        </span>
                      ) : (
                        <span className="text-xs text-(--text-secondary)">
                          {t("not crawlable")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirming === p.participantId ? (
                        <span className="flex flex-col items-end gap-1 text-xs">
                          <span className="whitespace-nowrap text-(--text-secondary)">
                            {p.source === "seed"
                              ? t("Remove? Back on next deploy")
                              : t("Remove?")}
                          </span>
                          <span className="flex gap-2">
                            <button
                              onClick={() => removeParticipant(p.participantId)}
                              className="rounded border border-red-400 px-2 py-0.5 text-red-500 hover:bg-red-500/10"
                            >
                              {t("Remove")}
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="rounded border border-(--border) px-2 py-0.5 text-(--text-secondary)"
                            >
                              {t("Cancel")}
                            </button>
                          </span>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirming(p.participantId)}
                          aria-label={t("Remove {name}", {
                            name: p.name ?? p.participantId,
                          })}
                          title={
                            p.source === "seed"
                              ? t(
                                  "Seeded: removed until the next deploy adds it back",
                                )
                              : t("Remove from the directory")
                          }
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
          className="mt-8 rounded-lg border border-(--border) bg-(--surface-2) p-6"
          data-testid="participant-form"
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-(--text-primary)">
            <Plus size={18} /> {t("Onboard participant wallet")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm text-(--text-secondary)">
              {t("Participant DID *")}
              <input
                required
                value={form.participantId}
                onChange={(e) =>
                  setForm({ ...form, participantId: e.target.value })
                }
                placeholder="did:web:clinic.example:participant"
                className="mt-1 w-full rounded-sm border border-(--border) bg-(--bg) px-3 py-2 font-mono text-xs text-(--text-primary)"
              />
            </label>
            <label className="text-sm text-(--text-secondary)">
              {t("Display name *")}
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Fictional Clinic GmbH"
                className="mt-1 w-full rounded-sm border border-(--border) bg-(--bg) px-3 py-2 text-(--text-primary)"
              />
            </label>
            <label className="text-sm text-(--text-secondary)">
              {t("Participant type")}
              <select
                value={form.participantType}
                onChange={(e) =>
                  setForm({ ...form, participantType: e.target.value })
                }
                className="mt-1 w-full rounded-sm border border-(--border) bg-(--bg) px-3 py-2 text-(--text-primary)"
              >
                <option>DATA_HOLDER</option>
                <option>DATA_USER</option>
                <option>HDAB</option>
              </select>
            </label>
            <label className="text-sm text-(--text-secondary)">
              {t("Wallet type")}
              <select
                value={form.walletType}
                onChange={(e) =>
                  setForm({ ...form, walletType: e.target.value })
                }
                className="mt-1 w-full rounded-sm border border-(--border) bg-(--bg) px-3 py-2 text-(--text-primary)"
              >
                <option value="business">{t("business")}</option>
                <option value="private">{t("private")}</option>
              </select>
            </label>
            <label className="text-sm text-(--text-secondary)">
              {t("Country (ISO-2)")}
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="DE"
                maxLength={2}
                className="mt-1 w-full rounded-sm border border-(--border) bg-(--bg) px-3 py-2 text-(--text-primary)"
              />
            </label>
            <label className="text-sm text-(--text-secondary)">
              {t("DSP catalog URL")}
              <input
                value={form.dspCatalogUrl}
                onChange={(e) =>
                  setForm({ ...form, dspCatalogUrl: e.target.value })
                }
                placeholder="https://clinic.example/api/dsp/catalog"
                className="mt-1 w-full rounded-sm border border-(--border) bg-(--bg) px-3 py-2 font-mono text-xs text-(--text-primary)"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-4 flex items-center gap-2 rounded-lg bg-(--accent) px-4 py-2 font-medium text-white transition-colors hover:bg-(--accent-hover) disabled:opacity-50 dark:text-gray-900"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Plus size={15} />
            )}
            {t("Add to directory")}
          </button>
        </form>
      </div>
    </div>
  );
}
