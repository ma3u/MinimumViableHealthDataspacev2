// ---------------------------------------------------------------------------
// The Azure resource policy, bound to each permit's policy hash
// ---------------------------------------------------------------------------
//
// KBS resource policies have no reference-value lookup, so the hash each SPE
// must present is written into the policy itself: trustee/policies/
// resource-azure.rego.tmpl holds the rules, and the line
//   permit_policy_hash := {}
// is replaced with the hashes of the permits, one per SPE, as `--policy`
// in scripts/azure/21-aci-confidential-spe.sh records them. A changed
// workload (another image, command or env name) changes its ccePolicy, so
// its HOST_DATA, so no key.

const MARKER = /^permit_policy_hash := \{\}$/m;

export function renderResourcePolicy(
  template: string,
  hashes: Record<string, string>,
): string {
  if (!MARKER.test(template))
    throw new Error("the template has no `permit_policy_hash := {}` line");
  const entries = Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) throw new Error("no permit policy hash to bind");
  for (const [spe, hash] of entries) {
    if (!/^spe-[0-9]+$/.test(spe))
      throw new Error(`'${spe}' is not an SPE (spe-<n>)`);
    if (!/^sha256:[0-9a-f]{64}$/.test(hash))
      throw new Error(`policy hash for ${spe} is not sha256:<64 hex>`);
  }
  const body = entries
    .map(([spe, hash]) => `\t"${spe}": "${hash.slice("sha256:".length)}",`)
    .join("\n");
  return template.replace(MARKER, `permit_policy_hash := {\n${body}\n}`);
}
