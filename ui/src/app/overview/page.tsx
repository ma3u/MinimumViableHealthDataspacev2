"use client";

/**
 * /overview: one state-first view per persona (issue #271, discussion #265).
 *
 * Left: the question, and the signals sorted worst first. Centre: the
 * layered 3D scene, an enhancement that is left out under reduced motion.
 * Right: one node in detail, with trend, chart, description and links to
 * the page that owns the record. Everything in the scene is also in the
 * list and the panel.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import OverviewDetail from "@/components/overview/OverviewDetail";
import { fetchApi } from "@/lib/api";
import { derivePersonaId } from "@/lib/auth";
import { useDemoPersona } from "@/lib/use-demo-persona";
import type {
  OverviewNode,
  OverviewView,
  Severity,
} from "@/lib/overview/types";
import { IS_STATIC } from "@/lib/static-export";
import { importOverview, type ImportGraph } from "@/lib/overview/import";
import { T, translate, useT } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";

function SceneLoading() {
  const t = useT("explore");
  return (
    <div className="flex h-full items-center justify-center text-sm text-(--text-secondary)">
      <Loader2 className="animate-spin mr-2" size={16} />{" "}
      {t("Loading the scene")}
    </div>
  );
}

const OverviewScene = dynamic(
  () => import("@/components/overview/OverviewScene"),
  {
    ssr: false,
    loading: () => <SceneLoading />,
  },
);

const PERSONAS = [
  { id: "patient", label: "Patient" },
  { id: "researcher", label: "Researcher" },
  { id: "hdab", label: "Access body" },
  { id: "hospital", label: "Data holder" },
] as const;
type Persona = (typeof PERSONAS)[number]["id"];

/** What a signal's dot means, for a screen reader. */
const SEVERITY_LABEL: Record<Severity, string> = {
  bad: "Not in order",
  warn: "At risk or due",
  info: "Information",
  ok: "In order",
};

const BADGE: Record<Severity, string> = {
  bad: "bg-red-500",
  warn: "bg-amber-500",
  info: "bg-sky-500",
  ok: "bg-emerald-500",
};

function OverviewContent() {
  const t = useT("explore");
  const lang = useLanguage();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const demoPersona = useDemoPersona();
  const roles: string[] = IS_STATIC
    ? [...(demoPersona?.roles ?? [])]
    : (session as { roles?: string[] } | null)?.roles ?? [];
  const username = IS_STATIC
    ? demoPersona?.username ?? null
    : session?.user?.name ?? null;
  const isAdmin = roles.includes("EDC_ADMIN");
  const derived = derivePersonaId(roles, username);
  const urlPersona = searchParams.get("persona") as Persona | null;
  const persona: Persona =
    urlPersona ??
    (PERSONAS.some((p) => p.id === derived)
      ? (derived as Persona)
      : roles.includes("TRUST_CENTER_OPERATOR") || isAdmin
        ? "hdab"
        : "patient");
  const patientId = searchParams.get("patientId");
  const sceneParam = searchParams.get("scene");
  // One imported transfer instead of the persona view (#876).
  const importId = searchParams.get("import");
  const importSpe = searchParams.get("spe") ?? "SPE-1";

  const [view, setView] = useState<OverviewView | null>(null);
  const [error, setError] = useState<{
    message: string;
    issue?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sceneOn, setSceneOn] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    } catch {
      /* no matchMedia in this environment */
    }
  }, []);

  useEffect(() => {
    // Until the session is known the persona is a guess; a fetch made then
    // can come back 403 after the real one and leave a stale banner.
    if (!IS_STATIC && sessionStatus === "loading") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setExpandedIds([]);
    const qs = new URLSearchParams({ persona });
    if (patientId) qs.set("patientId", patientId);
    const url = importId
      ? `/api/spe-imports/${encodeURIComponent(
          importId,
        )}/graph?spe=${encodeURIComponent(importSpe)}`
      : `/api/overview?${qs.toString()}`;
    fetchApi(url)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok || data?.error) {
          setError({
            message: data?.error ?? `HTTP ${r.status}`,
            issue: data?.issue,
          });
          setView(null);
        } else {
          setError(null);
          setView(
            importId
              ? importOverview(data as ImportGraph)
              : (data as OverviewView),
          );
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError({ message: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [persona, patientId, sessionStatus, importId, importSpe]);

  const showScene =
    sceneOn ??
    (sceneParam === "on" || (!reducedMotion && sceneParam !== "off"));

  const nodeById = useMemo(() => {
    const m = new Map<string, OverviewNode>();
    for (const n of view?.nodes ?? []) {
      m.set(n.id, n);
      for (const x of n.expand?.nodes ?? []) m.set(x.id, x);
    }
    return m;
  }, [view]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id && nodeById.get(id)?.expand) toggleExpand(id);
    },
    [nodeById, toggleExpand],
  );

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;

  // The view's fixed texts (title, question, layers, legend) are the
  // builders' (lib/overview) and are translated here; signals and node
  // details carry values and stay as the API words them.
  const shown = useMemo(
    () =>
      view && {
        ...view,
        layers: view.layers.map((l) => ({
          ...l,
          name: translate(lang, "explore", l.name),
        })),
      },
    [view, lang],
  );

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="w-full px-4 py-3">
        <header
          className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1"
          title={t(
            "The list on the left is the complete view; the scene is the same information in three dimensions and can be switched off. Article numbers follow Regulation (EU) 2025/327 as adopted.",
          )}
        >
          <h1 className="text-lg font-semibold leading-tight">
            {t(view?.title ?? "In one view")}
          </h1>
          <p className="text-sm text-(--text-secondary)">
            {view?.question
              ? t(view.question)
              : t(
                  "Each persona sees the state that matters to them: what is out of range, what is due, what is broken, and what to do next.",
                )}
          </p>
        </header>

        {importId && (
          <p className="mb-3 text-sm">
            <Link
              href="/data/transfer"
              className="text-(--accent) underline"
              data-testid="overview-import-back"
            >
              {t("Back to my data")}
            </Link>
          </p>
        )}

        {isAdmin && !importId && (
          <nav
            className="mb-4 flex flex-wrap gap-2 text-sm"
            aria-label={t("Persona")}
          >
            {PERSONAS.map((p) => (
              <Link
                key={p.id}
                href={`/overview?persona=${p.id}`}
                className={`px-3 py-1 rounded-full border ${
                  p.id === persona
                    ? "border-(--accent) text-(--accent)"
                    : "border-(--border) text-(--text-secondary)"
                }`}
                aria-current={p.id === persona ? "page" : undefined}
              >
                {t(p.label)}
              </Link>
            ))}
          </nav>
        )}

        {loading && (
          <div
            className="flex items-center gap-2 text-sm text-(--text-secondary)"
            data-testid="overview-loading"
          >
            <Loader2 className="animate-spin" size={16} />{" "}
            {t("Computing the view")}
          </div>
        )}

        {error && !loading && (
          <div
            className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm"
            data-testid="overview-error"
          >
            <p>{error.message}</p>
            {error.issue && (
              <p className="mt-1">
                <T
                  area="explore"
                  tags={{
                    a: (
                      <a
                        href={error.issue}
                        className="underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    ),
                  }}
                >
                  {"Tracked in <a>issue #271</a>."}
                </T>
              </p>
            )}
          </div>
        )}

        {view && shown && !loading && (
          <div
            className={`grid gap-4 ${
              selected
                ? "lg:grid-cols-[300px_minmax(0,1fr)_360px]"
                : "lg:grid-cols-[300px_minmax(0,1fr)]"
            }`}
          >
            {/* ── left: the view as a list ───────────────────────────────── */}
            <aside className="rounded-lg border border-(--border) bg-(--surface-2) p-4 text-sm lg:max-h-[calc(100vh-120px)] lg:overflow-auto">
              <p className="font-medium" data-testid="overview-question">
                {t(view.question)}
              </p>
              <p className="mt-1 text-xs text-(--text-secondary)">
                {view.article}
              </p>
              <h2 className="mt-4 mb-2 text-xs uppercase tracking-wide text-(--text-secondary)">
                {t("In one view")}
              </h2>
              <ul className="space-y-1" data-testid="overview-signals">
                {view.signals.map((s, i) => (
                  <li key={`${s.code}-${i}`}>
                    <button
                      type="button"
                      onClick={() => select(s.nodeId)}
                      className={`w-full text-left flex gap-2 items-start rounded-md px-2 py-1.5 border ${
                        selectedId === s.nodeId
                          ? "border-(--accent) bg-(--bg)"
                          : "border-transparent hover:bg-(--bg)"
                      }`}
                      data-testid="overview-signal"
                      data-severity={s.severity}
                      data-node={s.nodeId}
                      data-code={s.code}
                    >
                      <span
                        className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                          BADGE[s.severity]
                        }`}
                        aria-label={t(SEVERITY_LABEL[s.severity])}
                      />
                      <span>
                        <span className="block">{s.text}</span>
                        {s.article && (
                          <span className="block text-xs text-(--text-secondary)">
                            {s.article}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <h2 className="mt-4 mb-2 text-xs uppercase tracking-wide text-(--text-secondary)">
                {t("Legend")}
              </h2>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-(--text-secondary)">
                {view.legend.map((l) => (
                  <span key={l.text} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: l.color }}
                    />
                    {t(l.text)}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-(--text-secondary)">
                {t("As of {date}.", { date: view.asOf })}{" "}
                {view.dataNote ? t(view.dataNote) : ""}
              </p>
            </aside>

            {/* ── centre: the scene ──────────────────────────────────────── */}
            <section className="relative min-h-[520px] lg:h-[calc(100vh-120px)] rounded-lg border border-(--border) overflow-hidden bg-[#0b1220]">
              <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 pointer-events-none">
                {[...shown.layers]
                  .sort((a, b) => b.z - a.z)
                  .map((l) => (
                    <span
                      key={l.id}
                      className="text-[11px] text-slate-300 bg-slate-900/70 rounded-r px-2 py-0.5 border-l-2"
                      style={{ borderColor: l.color }}
                    >
                      {l.name}
                    </span>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => setSceneOn(!showScene)}
                className="absolute right-3 top-3 z-10 text-[11px] px-2 py-0.5 rounded-sm border border-slate-600 text-slate-300 bg-slate-900/70"
                data-testid="overview-scene-toggle"
                aria-pressed={showScene}
              >
                {showScene ? t("Scene off") : t("Scene on")}
              </button>
              {showScene ? (
                <OverviewScene
                  view={shown}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  onSelect={select}
                  className="absolute inset-0"
                />
              ) : (
                <div
                  className="flex h-full min-h-[520px] items-center justify-center p-6 text-center text-sm text-slate-300"
                  data-testid="overview-scene-off"
                >
                  {reducedMotion
                    ? t(
                        "The animated scene is off because your system asks for reduced motion. The list on the left is the full view.",
                      )
                    : t(
                        "The scene is off. The list on the left is the full view.",
                      )}
                </div>
              )}
              <div className="absolute bottom-2 right-3 z-10 text-[11px] text-slate-400 pointer-events-none">
                {t(
                  "drag to orbit · wheel to zoom · click a node · arrows move · shift + arrows rotate · + and - zoom · space pauses · orbits on its own after 30 s",
                )}
              </div>
            </section>

            {/* ── right: one node in detail ──────────────────────────────── */}
            {selected && (
              <OverviewDetail
                node={selected}
                expanded={expandedIds.includes(selected.id)}
                onClose={() => setSelectedId(null)}
                onToggleExpand={() => toggleExpand(selected.id)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const tc = useT("common");
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-(--bg) p-6 text-sm text-(--text-secondary)">
          {tc("Loading…")}
        </div>
      }
    >
      <OverviewContent />
    </Suspense>
  );
}
