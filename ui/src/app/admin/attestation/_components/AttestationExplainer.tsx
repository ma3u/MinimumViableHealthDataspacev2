import { Info } from "lucide-react";
import { ADR_068_URL } from "@/lib/spe";

/**
 * What attestation is and what each label proves, in plain words (#774).
 * The sources are ADR-068 (decisions 4, 5 and 7) and ADR-069, which puts both
 * SPE workspaces on ACI confidential containers.
 */
export function AttestationExplainer() {
  return (
    <aside
      aria-labelledby="attestation-explainer-title"
      className="bg-(--surface) border border-(--border) rounded-xl p-5 text-sm text-(--text-secondary) space-y-3"
    >
      <h2
        id="attestation-explainer-title"
        className="font-semibold text-(--text-primary) flex items-center gap-2"
      >
        <Info size={16} className="text-(--accent)" aria-hidden="true" />
        What attestation is
      </h2>
      <p>
        Before a workspace gets the key to its encrypted extract, it sends
        evidence: a report, signed inside the processor, of what was booted and
        measured. The access body&apos;s Trustee checks the signature back to
        the processor vendor, compares the measurements with its reference
        values and the permit&apos;s policy, and only then releases the key. No
        key, no data; every attestation and key release goes on the audit chain.
      </p>
      <div>
        <h3 className="font-semibold text-(--text-primary)">
          Two scopes of evidence
        </h3>
        <p>
          Node level (A1, &quot;Attested: SEV-SNP node&quot;) proves a
          confidential VM with encrypted memory and a measured boot, but not
          which container runs on it. Workload level (A2, &quot;Attested:
          confidential workload&quot;) proves the workload itself: its own
          evidence carries the hash of its policy, so hardware checks the
          permit&apos;s policy hash.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-(--text-primary)">
          On Azure: per workload (A2)
        </h3>
        <p>
          Both SPE workspaces run as ACI confidential container groups. The
          evidence proves that this exact container group, with the policy whose
          SHA-256 is the permit&apos;s policy hash (the report&apos;s
          HOST_DATA), runs on genuine AMD SEV-SNP hardware, inside
          Microsoft&apos;s utility VM. It does not prove what that utility VM
          image does: it is trusted because Microsoft endorses its measurement.
          And the Trustee runs in the hub&apos;s own subscription, operated as
          if by MedReg DE; for the claim to hold fully, the access body runs it
          in a subscription of its own.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-(--text-primary)">
          &quot;Simulated attestation&quot;
        </h3>
        <p>
          The evidence comes from the Trustee&apos;s sample attester, not from
          hardware. The flow is real: the Trustee, its policy, the key release,
          the encrypted extract and the audit record. The proof is not.
        </p>
      </div>
      <p>
        <a
          href={ADR_068_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-(--accent) hover:underline"
        >
          ADR-068: a sovereign confidential SPE
        </a>{" "}
        · ADR-069: two SPE workspaces as ACI confidential containers (proposed,
        #774)
      </p>
    </aside>
  );
}
