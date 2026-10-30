"use client";

import { Cpu, KeyRound, Lock, ShieldQuestion } from "lucide-react";
import { useSpeStatus } from "@/components/spe/use-spe-status";
import { SpeLabelBadge, SpeStatusText } from "@/components/spe/SpeBadges";
import { AKS_VM_USD_PER_HOUR } from "@/lib/azure-pricing";
import { ADR_068_URL, type SpeStatusResponse } from "@/lib/spe";
import { AKS_SPE_DETAILS, AKS_SPE_NODE_POOL } from "./constants";

/**
 * Where the SPEs run, in the topology (#774): the AKS confidential node with
 * one workspace per SPE, and the access body's Trustee on ACA. The node is
 * marked "in use" only when an SPE says it runs there.
 */
export function SpeTopologyView({ data }: { data: SpeStatusResponse | null }) {
  const spes = data?.spes ?? [];
  const onAks = spes.some((s) => s.runsOn.includes(AKS_SPE_NODE_POOL.cluster));
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
          )
        </span>
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div
          aria-label={`AKS cluster ${AKS_SPE_NODE_POOL.cluster}`}
          className="lg:col-span-2 border border-(--border) rounded-xl p-4 bg-(--surface)/40"
        >
          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
            <div>
              <p className="text-sm font-semibold text-(--text-primary) flex items-center gap-1.5">
                <Cpu size={14} aria-hidden="true" />
                AKS {AKS_SPE_NODE_POOL.cluster}
              </p>
              <p className="text-[11px] text-(--text-secondary) font-mono">
                node pool {AKS_SPE_NODE_POOL.name} · {AKS_SPE_NODE_POOL.nodes} ×{" "}
                {AKS_SPE_NODE_POOL.vmSize} · {AKS_SPE_DETAILS.tee} ·{" "}
                {AKS_SPE_DETAILS.os} · {AKS_SPE_DETAILS.region}
              </p>
              <p className="text-[11px] text-(--text-secondary)">
                ${AKS_VM_USD_PER_HOUR[AKS_SPE_NODE_POOL.vmSize]} an hour ·
                stopped off hours with everything else (ADR-053) · workspaces
                reload from the encrypted extract on every start
              </p>
            </div>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                onAks
                  ? "text-(--success-text) border-(--success)/40"
                  : "text-(--text-secondary) border-(--border)"
              }`}
            >
              {onAks ? "in use" : "not used by this stack"}
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {spes.length === 0 && (
              <li className="text-xs text-(--text-secondary)">
                No SPE reported
              </li>
            )}
            {spes.map((spe) => (
              <li
                key={spe.id}
                aria-label={`${spe.id} workspace`}
                className="border border-(--border) rounded-lg p-3 text-xs space-y-1"
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
              </li>
            ))}
          </ul>
        </div>
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
