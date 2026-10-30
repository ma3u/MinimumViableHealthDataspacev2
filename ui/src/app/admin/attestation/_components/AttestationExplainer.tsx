import { Info } from "lucide-react";
import { ADR_068_URL } from "@/lib/spe";

/**
 * What attestation is and what each label proves, in plain words (#774).
 * The source is ADR-068 decisions 4, 5 and 7.
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
          Node level (A1, &quot;Attested: SEV-SNP node&quot;)
        </h3>
        <p>
          Proves that the workspace runs on an AMD SEV-SNP confidential VM on
          genuine hardware, with encrypted memory and a measured boot. It does
          not prove which container runs on that node: the permit&apos;s policy
          hash is recorded, but hardware does not check it. That takes
          per-workload evidence (A2, &quot;Attested: confidential
          workload&quot;). On Azure the remaining trust is AMD&apos;s root of
          trust and Microsoft&apos;s paravisor.
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
        </a>
      </p>
    </aside>
  );
}
