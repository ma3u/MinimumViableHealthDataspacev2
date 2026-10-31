"use client";

import { Cpu, KeyRound, Lock, ShieldQuestion } from "lucide-react";
import { useSpeStatus } from "@/components/spe/use-spe-status";
import { SpeLabelBadge, SpeStatusText } from "@/components/spe/SpeBadges";
import { aciGroupMonthlyEur, formatEur } from "@/lib/azure-pricing";
import { ADR_068_URL, type SpeStatusResponse } from "@/lib/spe";
import { ACI_SPE_DETAILS, ACI_SPE_GROUPS } from "./constants";

/** "mvhd-spe-2" holds SPE-2. */
function speIdOf(group: string): string {
  return `SPE-${/(\d+)$/.exec(group)?.[1] ?? "?"}`;
}

/**
 * Where the SPEs run, in the topology (#774, ADR-069): one ACI confidential
 * container group per SPE workspace, and the access body's Trustee on ACA. A
 * group is marked "in use" only when its SPE says it runs there.
 */
export function SpeTopologyView({ data }: { data: SpeStatusResponse | null }) {
  const spes = data?.spes ?? [];
  const trustee = data?.trustee ?? null;
  return (
    <section aria-labelledby="spe-topology-title" className="mb-8">
      <h2
        id="spe-topology-title"
        className="font-semibold text-sm flex items-center gap-2 text-(--text-primary) mb-3"
      >
        <Lock size={16} className="text-(--layer5-text)" aria-hidden="true" />
        Secure processing environments
        <span className="text-xs font-normal text-(--text-secondary)">
          (
          <a
            href={ADR_068_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline"
          >
            ADR-068
          </a>
          , ADR-069 proposed)
        </span>
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <ul
          aria-label="ACI confidential container groups"
          className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {ACI_SPE_GROUPS.map((group) => {
            const spe = spes.find((s) => s.id === speIdOf(group.name));
            const inUse = Boolean(spe?.runsOn.includes(group.name));
            const cost = aciGroupMonthlyEur(group);
            return (
              <li
                key={group.name}
                aria-label={`ACI container group ${group.name}`}
                className="border border-(--border) rounded-xl p-4 bg-(--surface)/40 text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-(--text-primary) flex items-center gap-1.5 font-mono">
                    <Cpu size={14} aria-hidden="true" />
                    {group.name}
                  </p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      inUse
                        ? "text-(--success-text) border-(--success)/40"
                        : "text-(--text-secondary) border-(--border)"
                    }`}
                  >
                    {inUse ? "in use" : "not used by this stack"}
                  </span>
                </div>
                <p className="text-[11px] text-(--text-secondary) font-mono">
                  sku {ACI_SPE_DETAILS.sku} · {ACI_SPE_DETAILS.tee} ·{" "}
                  {ACI_SPE_DETAILS.region}
                </p>
                <p className="text-[11px] text-(--text-secondary) font-mono">
                  init {ACI_SPE_DETAILS.initContainer} ·{" "}
                  {group.containers
                    .map((c) => `${c.name} ${c.cpu} vCPU ${c.memGiB} GB`)
                    .join(" · ")}
                </p>
                <p className="text-[11px] text-(--text-secondary)">
                  {formatEur(cost.hourlyEur)} an hour while running · stopped
                  off hours (ADR-053) · reloads from the sealed extract on every
                  start
                </p>
                {spe ? (
                  <div
                    aria-label={`${spe.id} workspace`}
                    className="border-t border-(--border) pt-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold text-(--text-primary)">
                        {spe.id} · {spe.holder}
                      </span>
                      <SpeStatusText status={spe.status} />
                    </div>
                    <p className="text-[11px] text-(--text-secondary)">
                      {spe.runsOn}
                    </p>
                    <SpeLabelBadge spe={spe} />
                  </div>
                ) : (
                  <p className="text-(--text-secondary)">
                    {speIdOf(group.name)} not reported
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div
          aria-label="Trustee mvhd-trustee"
          className="border border-(--border) rounded-xl p-4 bg-(--surface)/40 text-xs space-y-1"
        >
          <p className="text-sm font-semibold text-(--text-primary) flex items-center gap-1.5">
            {trustee ? (
              <KeyRound size={14} aria-hidden="true" />
            ) : (
              <ShieldQuestion size={14} aria-hidden="true" />
            )}
            Trustee <span className="font-mono">mvhd-trustee</span>
          </p>
          <p className="text-[11px] text-(--text-secondary)">
            KBS, Attestation Service and RVPS on ACA; releases each
            workspace&apos;s extract key after attestation
          </p>
          {trustee ? (
            <>
              <p>
                Operator:{" "}
                <span className="text-(--text-primary)">
                  {trustee.operator}
                </span>
              </p>
              <p>
                Verifier:{" "}
                <span className="font-mono text-(--text-primary)">
                  {trustee.verifier}
                </span>
              </p>
              <p>
                {trustee.reachable ? (
                  <span className="text-(--success-text)">reachable</span>
                ) : (
                  <span className="text-(--danger-text)">not reachable</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-(--text-secondary)">Not reported by the proxy</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function SpeTopologySection() {
  const { data } = useSpeStatus();
  return <SpeTopologyView data={data} />;
}
