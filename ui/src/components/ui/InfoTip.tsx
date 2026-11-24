"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { useT } from "@/lib/i18n/translate";

/**
 * A small "i" next to a label that explains it in plain words. The text
 * shows on hover and on keyboard focus, and a tap toggles it, so it works
 * with a mouse, a keyboard, a screen reader and a finger. The text is
 * already translated by the caller.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const t = useT("admin");
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={t("About {label}", { label })}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="ml-1 text-(--text-secondary) hover:text-(--accent) focus:text-(--accent) focus:outline-none focus-visible:ring-1 focus-visible:ring-(--accent) rounded-full"
      >
        <Info size={11} aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`${
          open ? "block" : "hidden"
        } absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-(--border) bg-(--surface) p-2 text-[11px] font-normal normal-case tracking-normal leading-snug text-(--text-primary) shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}
