"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";
import { interestLabel } from "@/lib/patient/interests";

interface Suggested {
  id: string;
  label: string;
}

/**
 * A patient's health interests on their profile. Shown as chips; the
 * patient may edit them by choosing from the suggested list, and the choice
 * replaces what the record suggests (PUT /api/patient/profile/interests).
 */
export default function HealthInterests({
  patientId,
  interests,
  chosen,
  suggested,
  canEdit,
}: {
  patientId: string;
  interests: string[];
  /** True once the patient chose them, false while they come from the record. */
  chosen: boolean;
  suggested: Suggested[];
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState<string[]>(interests);
  const [isChosen, setIsChosen] = useState(chosen);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(interests);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/patient/profile/interests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, interests: draft }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        interests?: string[];
        error?: string;
        reason?: string;
      };
      if (!r.ok) {
        setError(body.reason ?? body.error ?? `HTTP ${r.status}`);
        return;
      }
      setCurrent(body.interests ?? draft);
      setIsChosen(true);
      setEditing(false);
    } catch {
      setError("The hub could not be reached");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="health-interests">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-lg font-semibold">Health Interests & Goals</h2>
        {canEdit && !IS_STATIC && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(current);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded border border-(--border) px-2 py-1 text-xs hover:bg-(--surface-2)"
            data-testid="health-interests-edit"
          >
            <Pencil size={12} aria-hidden /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {current.length === 0 && (
              <span className="text-sm text-(--text-secondary)">
                None chosen.
              </span>
            )}
            {current.map((i) => (
              <span
                key={i}
                className="text-xs px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700"
              >
                {interestLabel(i)}
              </span>
            ))}
          </div>
          <p className="text-xs text-(--text-secondary) mt-2">
            {isChosen
              ? "Chosen by you."
              : "Suggested from your record; edit them to choose your own."}
          </p>
        </>
      ) : (
        <div>
          <p className="text-sm text-(--text-secondary) mb-2">
            Choose what interests you. Your choice replaces the suggestions from
            your record.
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Suggested health interests"
          >
            {suggested.map((s) => {
              const on = draft.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border ${
                    on
                      ? "bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 border-teal-400 dark:border-teal-600"
                      : "border-(--border) text-(--text-secondary) hover:bg-(--surface-2)"
                  }`}
                >
                  {on && <Check size={12} aria-hidden />}
                  {s.label}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="text-sm text-red-700 dark:text-red-300 mt-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded bg-(--accent) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              data-testid="health-interests-save"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="rounded border border-(--border) px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
