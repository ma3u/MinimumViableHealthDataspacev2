import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// The permit's policy hash (ADR-068 decision 2, #774)
// ---------------------------------------------------------------------------
//
// SHA-256 over what decides what a workspace can do with the data: for each
// container (init containers first, in order) its name, image (by digest
// where the spec has one), command, arguments and the NAMES of its
// environment variables. Values are left out on purpose: they hold
// passwords, and a password rotation does not change what the workload does.
// Order of env names does not matter; order of containers does.
//
// Recorded on the permit (HDABApproval.policyHash) and in every SPE audit
// event. Hardware checks it only at A2, where the Kata agent policy or the
// ACI confcom policy is measured into the evidence; at M1 and A1 it is
// recorded and labelled "not checked by hardware".

export interface ContainerSpec {
  name?: string;
  image?: string;
  command?: string[];
  args?: string[];
  env?: Array<{ name: string }>;
}

export interface WorkloadSpec {
  initContainers?: ContainerSpec[];
  containers: ContainerSpec[];
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}

function reduce(c: ContainerSpec) {
  return {
    name: c.name ?? "",
    image: c.image ?? "",
    command: c.command ?? [],
    args: c.args ?? [],
    env: [...new Set((c.env ?? []).map((e) => e.name))].sort(),
  };
}

export function policyHash(spec: WorkloadSpec): string {
  if (!Array.isArray(spec.containers) || spec.containers.length === 0) {
    throw new Error("a workload without containers has no policy");
  }
  const reduced = {
    initContainers: (spec.initContainers ?? []).map(reduce),
    containers: spec.containers.map(reduce),
  };
  return `sha256:${createHash("sha256")
    .update(canonical(reduced), "utf8")
    .digest("hex")}`;
}

/** Accepts a pod spec, a pod template, a Deployment or a bare {containers}. */
export function workloadFrom(doc: unknown): WorkloadSpec {
  let d = doc as Record<string, unknown>;
  for (const step of ["spec", "template", "spec"]) {
    if (
      d &&
      !Array.isArray(d.containers) &&
      d[step] &&
      typeof d[step] === "object"
    ) {
      d = d[step] as Record<string, unknown>;
    }
  }
  if (!d || !Array.isArray(d.containers))
    throw new Error("no containers in the workload description");
  return d as unknown as WorkloadSpec;
}
