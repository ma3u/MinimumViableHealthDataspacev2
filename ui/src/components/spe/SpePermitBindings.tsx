"use client";

import { Cpu, FileLock2, Loader2, PowerOff } from "lucide-react";
import {
  ADR_068_URL,
  ADR_069_URL,
  permitBindings,
  type PermitHashCheck,
  type SpeStatusResponse,
} from "@/lib/spe";
import { PolicyHash, SpeLabelBadge } from "./SpeBadges";
import { useSpeStatus } from "./use-spe-status";
import { T, useT } from "@/lib/i18n/translate";

const CHECK_STYLE: Record<PermitHashCheck, string> = {
  hardware: "text-(--success-text) border-(--success)/40 bg-(--success)/10",
  "on-start": "text-(--text-secondary) border-(--border) bg-(--surface)",
  recorded: "text-(--warning-text) border-(--warning)/40 bg-(--warning)/10",
};

const CHECK_ICON: Record<PermitHashCheck, typeof Cpu> = {
  hardware: Cpu,
  "on-start": PowerOff,
  recorded: FileLock2,
};

/**
 * Each workspace's data permit, policy hash and Trustee resource, and
 * whether hardware checks the hash (#833), presentational.
 */
export function SpePermitBindingsView({ data }: { data: SpeStatusResponse }) {
  const t = useT("admin");
  const rows = permitBindings(data);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-(--text-secondary)">{t("No SPE reported")}</p>
    );
  }
  return (
    <div className="overflow-x-auto border border-(--border) rounded-xl">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-(--border) bg-(--surface)/60">
            {[
              t("Data permit"),
              t("SPE"),
              t("Policy hash"),
              t("Trustee resource"),
              t("Policy check"),
              t("Label"),
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
          {rows.map((row) => {
            const { spe, check } = row;
            const checkText =
              check.kind === "recorded"
                ? t("Recorded only ({depth})", { depth: check.depth })
                : t(check.text);
            const Icon = CHECK_ICON[check.kind];
            return (
              <tr
                key={spe.id}
                aria-label={t("Permit binding for {id}", { id: spe.id })}
                className="border-b border-(--border) align-top"
              >
                <td className="py-2 px-3">
                  <span className="font-mono text-[11px] text-(--text-primary)">
                    {row.permitId ?? t("no permit loaded")}
                  </span>
                  {row.permitName && (
                    <span className="block text-[11px] text-(--text-secondary)">
                      {row.permitName}
                    </span>
                  )}
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
                  <PolicyHash hash={row.policyHash} />
                  {row.hashSource === "permit" && (
                    <span className="block text-[11px] text-(--text-secondary)">
                      {t("as recorded on the permit in the hub")}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-[11px]">
                  {row.trusteeResource}
                </td>
                <td className="py-2 px-3">
                  <span
                    aria-label={t("Policy check: {text}", { text: checkText })}
                    data-check={check.kind}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${
                      CHECK_STYLE[check.kind]
                    }`}
                  >
                    <Icon size={10} aria-hidden="true" />
                    {checkText}
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
 * "Data permits in secure processing" on the policies page (#774, #833):
 * each permit's policy hash, the Trustee resource it opens, and whether
 * hardware checks the hash (on ACI: the SEV-SNP report's HOST_DATA) or it is
 * only recorded (the local stack, "Simulated attestation"). From
 * `/api/admin/spe`, the one source for the SPEs.
 */
export function SpePermitBindings() {
  const t = useT("admin");
  const { data, loading, error } = useSpeStatus();
  const link = (href: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-(--accent) hover:underline"
    />
  );
  return (
    <section aria-labelledby="spe-permits-title" className="mt-10 space-y-3">
      <div>
        <h2
          id="spe-permits-title"
          className="text-lg font-semibold text-(--text-primary)"
        >
          {t("Data permits in secure processing")}
        </h2>
        <p className="text-xs text-(--text-secondary) mt-0.5">
          <T area="admin" tags={{ a: link(ADR_068_URL), b: link(ADR_069_URL) }}>
            {
              "Each data permit records a policy hash for each workspace, and the access body's Trustee releases that workspace's extract key (the Trustee resource) only against it. On Azure each workspace is an ACI confidential container group: the hash is the HOST_DATA of its SEV-SNP report, so hardware checks it at every start (<b>ADR-069</b>). On the local stack it is recorded only, and the workspace is labelled “Simulated attestation” (<a>ADR-068</a>, decision 2)."
            }
          </T>
        </p>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          {t("Loading data permits…")}
        </p>
      ) : data ? (
        <SpePermitBindingsView data={data} />
      ) : (
        <p className="text-sm text-(--text-secondary)">
          {t("Secure processing environments unavailable")}
          {error ? `: ${error}` : ""}
        </p>
      )}
    </section>
  );
}
