"use client";

import { Cpu, FileLock2, Loader2 } from "lucide-react";
import {
  ADR_068_URL,
  policyCheckDepth,
  trusteeResource,
  type SpeStatusResponse,
} from "@/lib/spe";
import { PolicyHash, SpeLabelBadge } from "./SpeBadges";
import { useSpeStatus } from "./use-spe-status";

/** The permit to policy hash to Trustee resource bindings, presentational. */
export function SpePermitBindingsView({ data }: { data: SpeStatusResponse }) {
  const rows = data.spes;
  if (rows.length === 0) {
    return <p className="text-sm text-(--text-secondary)">No SPE reported</p>;
  }
  return (
    <div className="overflow-x-auto border border-(--border) rounded-xl">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-(--border) bg-(--surface)/60">
            {[
              "Data permit",
              "SPE",
              "Policy hash",
              "Trustee resource",
              "Policy check",
              "Label",
            ].map((h) => (
              <th
                key={h}
                className="py-2 px-3 font-medium text-(--text-secondary)"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((spe) => {
            const check = policyCheckDepth(spe);
            return (
              <tr
                key={spe.id}
                aria-label={`Permit binding for ${spe.id}`}
                className="border-b border-(--border)"
              >
                <td className="py-2 px-3 font-mono text-[11px] text-(--text-primary)">
                  {spe.permitId ?? "no permit loaded"}
                </td>
                <td className="py-2 px-3">
                  <span className="font-semibold text-(--text-primary)">
                    {spe.id}
                  </span>
                  <span className="block text-[11px] text-(--text-secondary)">
                    {spe.holder}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <PolicyHash hash={spe.policyHash} />
                </td>
                <td className="py-2 px-3 font-mono text-[11px]">
                  {trusteeResource(spe.id)}
                </td>
                <td className="py-2 px-3">
                  <span
                    aria-label={`Policy check: ${check.text}`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${
                      check.checked
                        ? "text-(--success-text) border-(--success)/40 bg-(--success)/10"
                        : "text-(--warning-text) border-(--warning)/40 bg-(--warning)/10"
                    }`}
                  >
                    {check.checked ? (
                      <Cpu size={10} aria-hidden="true" />
                    ) : (
                      <FileLock2 size={10} aria-hidden="true" />
                    )}
                    {check.text}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <SpeLabelBadge spe={spe} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "Data permits in secure processing" on the policies page (#774): each
 * permit's policy hash, the Trustee resource it opens, and whether hardware
 * checks the hash (A2) or it is only recorded (M1, A1). From
 * `/api/admin/spe`, the one source for the SPEs.
 */
export function SpePermitBindings() {
  const { data, loading, error } = useSpeStatus();
  return (
    <section aria-labelledby="spe-permits-title" className="mt-10 space-y-3">
      <div>
        <h2
          id="spe-permits-title"
          className="text-lg font-semibold text-(--text-primary)"
        >
          Data permits in secure processing
        </h2>
        <p className="text-xs text-(--text-secondary) mt-0.5">
          The permit records the SHA-256 of the workspace&apos;s pod spec; the
          access body&apos;s Trustee releases the extract key against it. Only
          per-workload evidence (A2) makes hardware check the hash; until then
          it is recorded and labelled so (
          <a
            href={ADR_068_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline"
          >
            ADR-068
          </a>
          , decision 2).
        </p>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Loading data permits…
        </p>
      ) : data ? (
        <SpePermitBindingsView data={data} />
      ) : (
        <p className="text-sm text-(--text-secondary)">
          Secure processing environments unavailable
          {error ? `: ${error}` : ""}
        </p>
      )}
    </section>
  );
}
