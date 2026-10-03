"use client";

import { COMPONENT_INFO, type ComponentMeta } from "@/lib/edc/component-info";
import { useState } from "react";
import { Info, X } from "lucide-react";

export function InfoPopover({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const meta: ComponentMeta | undefined = COMPONENT_INFO[name];
  if (!meta) return null;

  return (
    <span className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="text-[var(--text-secondary)] hover:text-teal-800 dark:hover:text-teal-300 transition-colors p-0.5"
        title={`Info: ${name}`}
      >
        <Info size={13} />
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute z-40 left-6 top-0 w-80 bg-[var(--surface-2)] border border-[var(--border-ui)] rounded-xl shadow-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm text-[var(--text-primary)]">
                {name}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              {meta.description}
            </p>
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 pt-1 border-t border-[var(--border)]">
              <span className="text-[var(--text-secondary)]">Protocol</span>
              <span className="text-[var(--text-primary)]">
                {meta.protocol}
              </span>
              <span className="text-[var(--text-secondary)]">Ports</span>
              <span className="text-[var(--text-primary)] font-mono text-[11px]">
                {meta.ports}
              </span>
              <span className="text-[var(--text-secondary)]">Depends on</span>
              <span className="text-[var(--text-primary)]">
                {meta.dependsOn.length > 0 ? meta.dependsOn.join(", ") : "None"}
              </span>
              <span className="text-[var(--text-secondary)]">Health</span>
              <span className="text-[var(--text-primary)]">
                {meta.healthSource}
              </span>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
