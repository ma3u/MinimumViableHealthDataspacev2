/**
 * Plain-language explanations for /admin/attestation: a short answer per
 * SPE, what each technical field means, and where the workspace's key is
 * kept and who can reach it. English is the key; the translations live in
 * ui/src/messages/<lang>/admin.json like every admin text.
 */
import type { AttestationVerdict } from "@/lib/spe";

/** The short answer at the top of an SPE card: a headline and one sentence. */
export function attestationInShort(
  verdict: AttestationVerdict,
  simulated: boolean,
): { headline: string; detail: string } {
  if (verdict === "none") {
    return {
      headline: "Not checked yet, so no key and no data.",
      detail:
        "The workspace has not proven what it runs. Until it does, the key broker keeps the key and the workspace stays empty.",
    };
  }
  if (verdict === "fail") {
    return {
      headline: "The proof did not check out, so the data stays locked.",
      detail:
        "The report could not be verified back to the processor's maker. The key broker released nothing.",
    };
  }
  if (verdict === "refused") {
    return {
      headline: "The proof was checked, but the key was refused.",
      detail:
        "The workspace does not run what the permit allows, so its data stays encrypted. The reason is shown below.",
    };
  }
  if (simulated) {
    return {
      headline: "The key was released, but no hardware vouched for it.",
      detail:
        "This workspace runs on a machine without confidential hardware, so a test attester stood in for the processor. The steps are real, the protection is not: use it to see how the check works.",
    };
  }
  return {
    headline:
      "The processor proved that this workspace runs exactly the software the permit allows.",
    detail:
      "The access body's key broker checked that proof and only then released the key to the data. The data is decrypted only inside encrypted memory that the cloud operator cannot read.",
  };
}

/** What each field on the card means, shown behind its "i". */
export const FIELD_INFO: Record<string, string> = {
  "Trustee operator":
    "Who runs the key broker that holds the key to the data. Here it is the health data access body, not the hosting provider.",
  Verifier:
    "The service that checked the workspace's proof. 'sample' is the key broker's test attester, used where there is no confidential hardware.",
  "Attestation policy":
    "The rule set the proof was checked against. 'default' is the key broker's standard policy for this workspace.",
  "Token valid":
    "After a successful check the key broker issues a short-lived pass. The key can be fetched only while the pass is valid.",
  Scope:
    "How far the proof reaches: the whole confidential virtual machine (node), or this exact container group and its settings (workload).",
  TEE: "The protected hardware the workspace runs in, such as AMD SEV-SNP. It encrypts the memory so that the operator cannot read it. 'sample' means none.",
  "Residual trust":
    "What you still have to take on trust because the proof does not cover it.",
  "Last attestation":
    "When the workspace last proved what it runs. It proves itself again every time it starts.",
  Measurement:
    "A fingerprint of the software the processor started. If anything in it changes, this number changes.",
  "Reported TCB":
    "The version of the processor's security firmware. A version below the minimum is refused (ADR-073).",
  "Host data":
    "The fingerprint of the exact policy the workspace was started with: images, commands and settings. It must equal the permit's policy hash, and that is what links the permit to the hardware.",
  "Report data":
    "A value the workspace writes into its own report. It ties the report to this request, so an old report cannot be replayed.",
  "VM id":
    "The identifier of the virtual machine, where the platform reports one.",
  "Evidence digest":
    "A fingerprint of the whole report, as it is stored in the audit trail.",
  "Data permit":
    "The access body's decision that allows this use of the data (EHDS Art. 68).",
  "Policy hash":
    "A fingerprint of exactly the software and settings the permit allows. Any change gives a different fingerprint, and the key is not released.",
  "Trustee resource":
    "The name under which the key broker keeps this workspace's key.",
  "Key released":
    "When the key broker handed out the key, after the proof matched the permit.",
  "Workspace loaded":
    "When the decrypted data was loaded into the workspace's protected memory.",
};

export const EVIDENCE_SUMMARY = "Technical evidence, for auditors";
export const EVIDENCE_INTRO =
  "The raw values from the signed report. An auditor compares them with the expected values; you do not need them to read the answer above.";

/** Whether the report's HOST_DATA is the permit's policy hash. */
export function hostDataMatchesPolicy(
  hostData: string | null | undefined,
  policyHash: string | null | undefined,
): boolean | null {
  if (!hostData || !policyHash) return null;
  const strip = (h: string) => h.toLowerCase().replace(/^sha256:/, "");
  return strip(hostData) === strip(policyHash);
}

export const HOST_DATA_MATCH = "Same as the permit's policy hash";
export const HOST_DATA_MISMATCH = "Differs from the permit's policy hash";

/**
 * Where the workspace's key is kept and who can reach it, in three answers.
 * `place` depends on where the SPE runs: the static demo and a laptop use
 * the Trustee container of the compose stack, Azure the Trustee app.
 */
export function keyCustody(simulated: boolean): {
  title: string;
  rows: { label: string; text: string }[];
} {
  return {
    title: "Where the key is kept, and who can reach it",
    rows: [
      {
        label: "Where it is kept",
        text: simulated
          ? "In the key broker (Trustee) of this demo, a container on the same machine as the workspace. Nothing here is protected by hardware."
          : "In the key broker (Trustee) that runs for the access body, on two file shares of the hub's own cloud subscription. Deliberately not in the cloud provider's key vault, so the cloud provider does not decide who gets the key.",
      },
      {
        label: "How safe that is",
        text: simulated
          ? "Demo level: anyone with access to the machine can read the key. Use it to see the flow, never for real data."
          : "Encrypted at rest by the storage service, but the key broker itself does not run in confidential hardware, and the subscription owner could read its shares. Full sovereignty needs the access body to run the key broker in a subscription of its own; that step is still open.",
      },
      {
        label: "Who can get it",
        text: simulated
          ? "Only a workspace whose proof matches the permit. Its unlock step asks once, at start. Here the proof comes from the test attester, so anything that imitates it could ask too."
          : "Only this workspace, and only after its proof matches the permit. Its unlock step asks once, at start. The key comes back encrypted to a one-time key that exists only inside the workspace's protected memory, so it is never readable on the way.",
      },
      {
        label: "Who can change it",
        text: "Only the access body's administrator, with the key broker's admin key, can store keys and set policies. Every release and every refusal is recorded on the audit chain.",
      },
    ],
  };
}

/** Every English text above, for the translation tests. */
export function allAttestationTexts(): string[] {
  const verdicts: AttestationVerdict[] = ["none", "fail", "refused", "pass"];
  const shorts = verdicts.flatMap((v) =>
    [true, false].flatMap((s) => {
      const x = attestationInShort(v, s);
      return [x.headline, x.detail];
    }),
  );
  const custody = [true, false].flatMap((s) => {
    const k = keyCustody(s);
    return [k.title, ...k.rows.flatMap((r) => [r.label, r.text])];
  });
  return [
    ...new Set([
      ...shorts,
      ...Object.values(FIELD_INFO),
      EVIDENCE_SUMMARY,
      EVIDENCE_INTRO,
      HOST_DATA_MATCH,
      HOST_DATA_MISMATCH,
      ...custody,
      "In short",
      "About {label}",
      ...allLightTexts(),
    ]),
  ];
}

export type Light = "green" | "amber" | "red";

/** The traffic light of one SPE's attestation. */
export function attestationLight(input: {
  verdict: AttestationVerdict;
  simulated: boolean;
  hostMatch: boolean | null;
  keyReleased: boolean;
}): Light {
  const { verdict, simulated, hostMatch, keyReleased } = input;
  if (verdict === "fail" || verdict === "refused" || hostMatch === false) {
    return "red";
  }
  if (verdict === "pass" && !simulated && hostMatch === true && keyReleased) {
    return "green";
  }
  return "amber";
}

export const LIGHT_MEANING: Record<Light, string> = {
  green: "Green: proven by hardware",
  amber: "Amber: works, but not fully proven",
  red: "Red: blocked, no key and no data",
};

export type CheckState = "ok" | "warn" | "fail";

/** The few plain checks under the light, each with its own colour. */
export function attestationChecks(input: {
  verdict: AttestationVerdict;
  simulated: boolean;
  hostMatch: boolean | null;
  keyReleased: boolean;
  audited: boolean;
}): { state: CheckState; text: string; info: string }[] {
  const { verdict, simulated, hostMatch, keyReleased, audited } = input;
  return [
    simulated
      ? {
          state: "warn",
          text: "No confidential hardware on this machine",
          info: "A test attester stood in for the processor. The steps are real, but nothing proves that the memory is protected.",
        }
      : {
          state: "ok",
          text: "Runs on confidential hardware",
          info: "The processor (AMD SEV-SNP) encrypts the workspace's memory and signs a report of what it started, so the operator cannot read the data.",
        },
    hostMatch === true
      ? {
          state: "ok",
          text: "Runs exactly the software the permit allows",
          info: "The fingerprint in the processor's report equals the fingerprint recorded on the data permit. A changed image, command or setting would give a different one.",
        }
      : hostMatch === false
        ? {
            state: "fail",
            text: "Runs software the permit does not allow",
            info: "The fingerprint in the processor's report differs from the one on the data permit, so the key broker must not release the key.",
          }
        : {
            state: "warn",
            text: "Not compared with the permit yet",
            info: "There is no report or no permit fingerprint to compare, so it is not known whether the workspace runs what the permit allows.",
          },
    verdict === "refused" || verdict === "fail"
      ? {
          state: "fail",
          text: "Key refused, the data stays encrypted",
          info: "The key broker did not hand out the key, so the workspace cannot read its data.",
        }
      : keyReleased
        ? {
            state: "ok",
            text: "Key released only after the check",
            info: "The access body's key broker handed out the key only after the proof matched the permit. It reaches the workspace only in encrypted form.",
          }
        : {
            state: "warn",
            text: "No key released yet",
            info: "The workspace has not received its key, so it holds no data yet.",
          },
    simulated
      ? {
          state: "warn",
          text: "Key kept by the demo's key broker on the same machine",
          info: "Anyone with access to the machine could read it. Fine for seeing the flow, never for real data.",
        }
      : {
          state: "warn",
          text: "Key kept for the access body, in the hub's own subscription",
          info: "Not in the cloud provider's key vault, so the cloud provider does not decide who gets the key. But the subscription owner could read the key broker's storage until the access body runs it in a subscription of its own.",
        },
    audited
      ? {
          state: "ok",
          text: "Every step recorded on the audit chain",
          info: "Attestation, key release, loading and deletion each leave a record on the tamper-evident audit chain.",
        }
      : {
          state: "warn",
          text: "Nothing recorded on the audit chain yet",
          info: "No attestation or key event of this workspace has reached the audit chain.",
        },
  ];
}

/** Every text of the light and the checks, for the translation tests. */
export function allLightTexts(): string[] {
  const out = new Set<string>(Object.values(LIGHT_MEANING));
  for (const verdict of ["none", "fail", "refused", "pass"] as const) {
    for (const simulated of [true, false]) {
      for (const hostMatch of [true, false, null]) {
        for (const keyReleased of [true, false]) {
          for (const audited of [true, false]) {
            for (const c of attestationChecks({
              verdict,
              simulated,
              hostMatch,
              keyReleased,
              audited,
            })) {
              out.add(c.text);
              out.add(c.info);
            }
          }
        }
      }
    }
  }
  out.add("Attestation light: {meaning}");
  out.add("{id} checks");
  out.add("More about attestation");
  return [...out];
}
