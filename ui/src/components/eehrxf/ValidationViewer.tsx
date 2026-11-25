"use client";

/**
 * The resources a profile was validated against, one at a time, as the HL7
 * FHIR Validator saw them: the JSON with every error and warning marked on
 * the line it is about, and the list of issues beside it.
 *
 * The data are static files scripts/eehrxf/build.py writes to
 * ui/public/eehrxf/validation/<profileId>.json from the committed validation
 * results, so the viewer works in the GitHub Pages build as well.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, X, XCircle } from "lucide-react";
import { BASE_PATH } from "@/lib/static-export";
import { useT } from "@/lib/i18n/translate";

export interface ViewerIssue {
  severity: "fatal" | "error" | "warning";
  expression: string;
  message: string;
  ignored?: boolean;
}

export interface ViewerResource {
  source: string;
  origin: string;
  passed: boolean;
  issues: ViewerIssue[];
  resource: Record<string, unknown>;
}

export interface ViewerProfile {
  profileId: string;
  name: string;
  canonical: string;
  igPackage: string;
  tested: number;
  passed: number;
  resources: ViewerResource[];
}

export const viewerUrl = (profileId: string) =>
  `${BASE_PATH}/eehrxf/validation/${encodeURIComponent(profileId)}.json`;

/**
 * The validator's expression in the path form the JSON lines carry:
 * `value.ofType(Quantity)` is `valueQuantity` in JSON, and `[n]` indexes stay.
 */
export function normalizeExpression(expression: string): string {
  return expression
    .replace(
      /\.(\w+)\.ofType\((\w+)\)/g,
      (_m, el: string, type: string) =>
        `.${el}${type.charAt(0).toUpperCase()}${type.slice(1)}`,
    )
    .replace(/\/\*[^*]*\*\//g, "");
}

interface Line {
  path: string;
  depth: number;
  text: string;
}

/** The resource as indented JSON lines, each knowing its FHIRPath-like path. */
export function jsonLines(resource: Record<string, unknown>): Line[] {
  const root = String(resource.resourceType ?? "Resource");
  const lines: Line[] = [];
  const walk = (
    value: unknown,
    path: string,
    depth: number,
    key: string | null,
    last: boolean,
  ) => {
    const label = key === null ? "" : `"${key}": `;
    const comma = last ? "" : ",";
    if (Array.isArray(value)) {
      lines.push({ path, depth, text: `${label}[` });
      value.forEach((v, i) =>
        walk(v, `${path}[${i}]`, depth + 1, null, i === value.length - 1),
      );
      lines.push({ path, depth, text: `]${comma}` });
    } else if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      lines.push({ path, depth, text: `${label}{` });
      entries.forEach(([k, v], i) =>
        walk(v, `${path}.${k}`, depth + 1, k, i === entries.length - 1),
      );
      lines.push({ path, depth, text: `}${comma}` });
    } else {
      lines.push({
        path,
        depth,
        text: `${label}${JSON.stringify(value)}${comma}`,
      });
    }
  };
  walk(resource, root, 0, null, true);
  return lines;
}

/**
 * The line an issue belongs to: the first line of the deepest path the
 * expression starts with, or the first line when nothing deeper matches.
 */
export function lineForIssue(lines: Line[], issue: ViewerIssue): number {
  const target = normalizeExpression(issue.expression);
  let best = 0;
  let bestLength = -1;
  lines.forEach((line, i) => {
    const matches =
      target === line.path ||
      target.startsWith(`${line.path}.`) ||
      target.startsWith(`${line.path}[`);
    if (matches && line.path.length > bestLength) {
      best = i;
      bestLength = line.path.length;
    }
  });
  return best;
}

const SEVERITY_CLASS: Record<ViewerIssue["severity"], string> = {
  fatal: "text-red-700 dark:text-red-300",
  error: "text-red-700 dark:text-red-300",
  warning: "text-amber-700 dark:text-amber-300",
};

function SeverityIcon({ severity }: { severity: ViewerIssue["severity"] }) {
  return severity === "warning" ? (
    <AlertTriangle size={12} className={SEVERITY_CLASS.warning} />
  ) : (
    <XCircle size={12} className={SEVERITY_CLASS.error} />
  );
}

export default function ValidationViewer({
  profileId,
  onClose,
}: {
  profileId: string;
  onClose: () => void;
}) {
  const t = useT("holder");
  const [data, setData] = useState<ViewerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("all");
  const [failingOnly, setFailingOnly] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(viewerUrl(profileId))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ViewerProfile) => {
        setData(d);
        setSelected(0);
      })
      .catch((e: Error) => setError(e.message));
  }, [profileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sources = useMemo(
    () => [...new Set((data?.resources ?? []).map((r) => r.source))],
    [data],
  );
  const shown = useMemo(
    () =>
      (data?.resources ?? []).filter(
        (r) =>
          (source === "all" || r.source === source) &&
          (!failingOnly || !r.passed),
      ),
    [data, source, failingOnly],
  );
  const current = shown[Math.min(selected, Math.max(shown.length - 1, 0))];
  const lines = useMemo(
    () => (current ? jsonLines(current.resource) : []),
    [current],
  );
  const byLine = useMemo(() => {
    const m = new Map<number, ViewerIssue[]>();
    for (const issue of current?.issues ?? []) {
      const i = lineForIssue(lines, issue);
      m.set(i, [...(m.get(i) ?? []), issue]);
    }
    return m;
  }, [current, lines]);

  const errors = (current?.issues ?? []).filter(
    (i) => i.severity !== "warning",
  ).length;
  const warnings = (current?.issues ?? []).length - errors;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-viewer-title"
      data-testid="validation-viewer"
    >
      <div className="bg-(--bg) border border-(--border) rounded-xl w-full max-w-6xl flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-(--border)">
          <div className="flex-1 min-w-0">
            <h2
              id="validation-viewer-title"
              className="font-semibold text-sm text-(--text-primary) truncate"
            >
              {t("Validated resources: {name}", {
                name: data?.name ?? profileId,
              })}
            </h2>
            {data && (
              <p className="text-xs text-(--text-secondary) truncate font-mono">
                {data.canonical} ({data.igPackage})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-(--text-secondary) hover:text-(--text-primary)"
            aria-label={t("Close")}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <p className="p-4 text-sm text-(--text-secondary)">{error}</p>
        )}
        {!data && !error && (
          <p className="p-4 text-sm text-(--text-secondary)">
            {t("Loading validation results…")}
          </p>
        )}

        {data && (
          <div className="flex flex-1 min-h-0 flex-col md:flex-row">
            {/* Resource list */}
            <div className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-(--border) flex flex-col min-h-0">
              <div className="p-2 flex flex-col gap-2 border-b border-(--border)">
                <select
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setSelected(0);
                  }}
                  className="text-xs bg-(--surface) border border-(--border) rounded-sm px-2 py-1 text-(--text-primary)"
                  aria-label={t("Source")}
                >
                  <option value="all">{t("All sources")}</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-(--text-secondary)">
                  <input
                    type="checkbox"
                    checked={failingOnly}
                    onChange={(e) => {
                      setFailingOnly(e.target.checked);
                      setSelected(0);
                    }}
                  />
                  {t("Failing only")}
                </label>
                <p className="text-[11px] text-(--text-secondary)">
                  {t("{passed}/{tested} pass", {
                    passed: data.passed,
                    tested: data.tested,
                  })}
                </p>
              </div>
              <ul className="overflow-auto flex-1 max-h-48 md:max-h-none">
                {shown.map((r, i) => (
                  <li key={`${r.source}-${r.origin}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className={`w-full text-left px-2 py-1.5 text-[11px] flex items-start gap-1.5 hover:bg-(--surface-2) ${
                        current === r ? "bg-(--surface-2)" : ""
                      }`}
                    >
                      {r.passed ? (
                        <CheckCircle
                          size={12}
                          className="text-green-700 dark:text-green-300 shrink-0 mt-0.5"
                        />
                      ) : (
                        <XCircle
                          size={12}
                          className="text-red-700 dark:text-red-300 shrink-0 mt-0.5"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-(--text-primary) truncate">
                          {r.origin}
                        </span>
                        <span className="block text-(--text-secondary)">
                          {r.source}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* JSON with the issues on their lines */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              {current ? (
                <>
                  <div className="px-3 py-2 border-b border-(--border) flex flex-wrap items-center gap-3 text-xs">
                    <span
                      className={
                        current.passed
                          ? "text-green-700 dark:text-green-300 font-medium"
                          : "text-red-700 dark:text-red-300 font-medium"
                      }
                    >
                      {current.passed ? t("Passes") : t("Fails")}
                    </span>
                    <span className="text-(--text-secondary)">
                      {t("{n} errors", { n: errors })}
                    </span>
                    <span className="text-(--text-secondary)">
                      {t("{n} warnings", { n: warnings })}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto grid lg:grid-cols-[1fr_20rem]">
                    <pre
                      className="text-[11px] leading-5 font-mono p-3 text-(--text-primary) overflow-x-auto"
                      data-testid="validation-viewer-json"
                    >
                      {lines.map((line, i) => {
                        const here = byLine.get(i);
                        const worst = here?.some(
                          (x) => x.severity !== "warning",
                        )
                          ? "error"
                          : here
                            ? "warning"
                            : null;
                        return (
                          <div
                            key={i}
                            id={`viewer-line-${i}`}
                            className={
                              worst === "error"
                                ? "bg-red-500/15"
                                : worst === "warning"
                                  ? "bg-amber-500/15"
                                  : ""
                            }
                            title={here?.map((x) => x.message).join("\n")}
                          >
                            <span className="select-none text-(--text-secondary) inline-block w-8 text-right mr-2">
                              {i + 1}
                            </span>
                            {"  ".repeat(line.depth)}
                            {line.text}
                          </div>
                        );
                      })}
                    </pre>
                    <ul
                      className="border-t lg:border-t-0 lg:border-l border-(--border) p-3 flex flex-col gap-2 text-[11px]"
                      data-testid="validation-viewer-issues"
                    >
                      {current.issues.length === 0 && (
                        <li className="text-(--text-secondary)">
                          {t("No errors or warnings")}
                        </li>
                      )}
                      {current.issues.map((issue, k) => {
                        const line = lineForIssue(lines, issue);
                        return (
                          <li key={k}>
                            <a
                              href={`#viewer-line-${line}`}
                              className="flex items-start gap-1.5 hover:underline"
                              onClick={(e) => {
                                e.preventDefault();
                                document
                                  .getElementById(`viewer-line-${line}`)
                                  ?.scrollIntoView({ block: "center" });
                              }}
                            >
                              <span className="mt-0.5 shrink-0">
                                <SeverityIcon severity={issue.severity} />
                              </span>
                              <span className="min-w-0 break-words">
                                <span className="block font-mono text-(--text-secondary)">
                                  {issue.expression || "(resource)"} ·{" "}
                                  {t("line {n}", { n: line + 1 })}
                                </span>
                                <span
                                  className={`block ${
                                    SEVERITY_CLASS[issue.severity]
                                  }`}
                                >
                                  {issue.message}
                                </span>
                                {issue.ignored && (
                                  <span className="block text-(--text-secondary) italic">
                                    {t("Ignored by a configured rule")}
                                  </span>
                                )}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="p-4 text-sm text-(--text-secondary)">
                  {t("No resources match the filter")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
