---
type: runbook
title: SPE attestation on Azure (ACI confidential containers and Trustee)
description: Set up, pin, check, stop and start the two SPE workspaces on ACI confidential container groups, attested to the access body's Trustee; with every failure seen on 2026-11-01/02, its log line and its fix.
resource: scripts/azure/21-aci-confidential-spe.sh, scripts/azure/aci/spe-workspace.template.json, services/spe-loader/, services/spe-loader/patches/snp-attester-plain-report.patch, trustee/reference-values-aci.example.json, ui/src/app/admin/attestation/
tags:
  [
    runbook,
    azure,
    aci,
    confidential-computing,
    sev-snp,
    trustee,
    spe,
    issue-774,
  ]
generated: { by: claude-code/opus-5.5, at: 2026-11-02T00:00:00Z }
verified: { by: UNKNOWN, at: UNKNOWN }
status: draft
---

How the hub's two secure processing environments (EHDS Art. 73) prove
themselves on Azure before they get any data. Design:
[ADR-068](../../ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md)
(Trustee run by the access body, Neo4j loaded per permit from a sealed extract);
placement on Azure:
[ADR-069](../../ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)
(proposed). Everything below was done live in
[#774](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/774) on
2026-11-01 and 2026-11-02.

## What runs where

| Part                      | Azure resource                                            | What it does                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPE-1, AlphaKlinik Berlin | ACI group `mvhd-spe-1`, `sku: Confidential`, westeurope   | init `spe-unlock` attests and gets the key; `neo4j` (Bolt with TLS, CA pinned); sidecar `spe-ingest` loads the extract                                         |
| SPE-2, Limburg MC         | ACI group `mvhd-spe-2`, same shape                        | same, the other half of the synthetic patients                                                                                                                 |
| Trustee (MedReg DE)       | ACA app `mvhd-trustee`, job `mvhd-trustee-admin`          | KBS with the built-in attestation service, v0.22.0; verifies SEV-SNP evidence, compares reference values and HOST_DATA, releases `default/spe-<n>/extract-key` |
| Trustee state             | shares `trustee-keys`, `trustee-data`                     | admin key, token key, resource policy, reference values, extract keys; never the hub's Key Vault                                                               |
| Sealed extracts           | share `spe-extracts`, baked into `mvhd-spe-loader-spe<n>` | ciphertext only; the extract's digest is part of the policy hash                                                                                               |
| Federation and audit      | ACA app `mvhd-neo4j-proxy`                                | asks the workspaces the SPE questions, appends their `spe.*` events to the hub's audit chain `spe`                                                             |

The chain of trust, in one line: the AMD-signed SEV-SNP report carries the
launch measurement of Microsoft's utility VM and, as HOST_DATA, the SHA-256 of
the group's ccePolicy; Trustee checks the signature back to AMD (VCEK from AMD
KDS), the measurement and TCB against pinned reference values, and HOST_DATA
against the permit's policy hash, and only then releases the key. No key, no
data.

## Prerequisites

- **PIM first, then `az login`.** Activate `rol-ssg-prd-project_owner`
  (identities, role assignments, shares) and log in afterwards; a token from
  before the activation lacks the role although the activation reports success
  (`AuthorizationFailed` on share `trustee-data`). The session lasts one hour:
  split the work at the hour.
- `az extension add --name confcom` (2.4.1 was used), Docker (for `--policy`:
  the images are pulled and measured; `acipolicygen` refuses macOS, so on a Mac
  the script runs it in a linux/amd64 container), `jq`, a clone at the commit
  you want to deploy.
- The stack is up (`scripts/azure/offhours.sh start` off hours): `--extracts`
  reads the hub's Neo4j. Working past 18:13 UTC: hold the stack with the tag on
  `mvhd-ui`. Set it with `az tag update`; `az resource update`, as the
  off-hours runbook has it, fails on the app's secrets ("value or keyVaultUrl
  and identity should be provided"):

  ```bash
  az tag update --operation Merge --tags live-demo-hold-until=2026-11-01T22:00Z \
    --resource-id "$(az containerapp show -n mvhd-ui -g rg-mvhd-dev --query id -o tsv)"
  ```

- Local state, outside the repository: `~/.mvhd/spe-state/` (image digests,
  policy hashes, FQDNs, your reference values file) and `~/.mvhd/spe-ca/` (the
  Bolt CA, mode 700). Nothing secret is printed by the script.

## Phase 21, in order

All steps are `scripts/azure/21-aci-confidential-spe.sh <phase>`; each is
idempotent and can run again.

| #   | Command                                                          | What it does                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `--trustee`                                                      | identity, shares, images (the KBS imported by digest; kbs-client with the plain-report patch, tag `v0.22.0-<commit>`), `mvhd-trustee` and its admin job. Deny-all until a permit is bound.        |
| 2   | `--extracts` (`--rekey` on a re-run)                             | exports each SPE's half of the hub's synthetic patients (107 and 108 on 2026-11-01), seals it, puts the key into Trustee, bakes the ciphertext into `mvhd-spe-loader-spe<n>`.                     |
| 3   | `--policy`                                                       | TLS certificates, Neo4j passwords (written to Key Vault without a trailing newline), `az confcom acipolicygen` per group; prints each policy hash, records it on the permit, binds it in Trustee. |
| 4   | `--workspaces`                                                   | deploys `mvhd-spe-1` and `mvhd-spe-2`. The first attestation is refused, by design (next section).                                                                                                |
| 5   | `--check`                                                        | prints each group's state, the `spe-unlock` lines (`attested`, `refused`, `pinnable claims`, `platform`, `HOST_DATA`) and the last `spe-ingest` lines.                                            |
| 6   | pin reference values, then `--trustee --reference-values <file>` | see the next section.                                                                                                                                                                             |
| 7   | `--workspaces` again                                             | **not** `az container restart`: a restart does not re-run `spe-unlock` (see gotchas).                                                                                                             |
| 8   | `--check`                                                        | both groups `attested: Attested: confidential workload, ear.status affirming` and `unlocked; the sidecar loads it`.                                                                               |
| 9   | `--wire-proxy`                                                   | points `mvhd-neo4j-proxy` at both groups (Bolt with TLS, CA pinned); records what it replaces (undo: `--unwire-proxy`).                                                                           |
| 10  | `scripts/azure/18-offhours-jobs.sh`                              | lets the off-hours identity stop and start the groups; see "Stopping, starting, costs" for the role it actually got.                                                                              |

The policy hashes on permit `hdab-medreg-spe-2026-001` after the 2026-11-01 run:
SPE-1 `sha256:0549ab01…bcb024`, SPE-2 `sha256:a7fc94f3…c914ca`. A new image,
extract or template changes them: run `--policy --workspaces` after
`--extracts`, and the permit records the new hash.

## First attestation and pinning the reference values

There is no unlock on first use. With no launch measurement pinned, Trustee's
token says `ear.status contraindicated` and the resource policy refuses the key:

```
[spe-loader] attested: Attested: confidential workload, ear.status contraindicated
[spe-loader] pinnable claims: {"measurement":"dc3f5a93…b9866","reported_tcb_bootloader":10,…}
[spe-loader] refused: Trustee refused default/spe-1/extract-key (ear.status contraindicated): …
```

1. **Collect** the `pinnable claims` line of both groups from `--check`.
2. **Check the launch measurement against Microsoft's endorsement** before
   pinning it. The UVM puts `reference-info-base64` into
   `$UVM_SECURITY_CONTEXT_DIR` of every confidential group. The workspaces'
   ccePolicy allows no exec, so it was read from a throwaway confidential group
   with an allow-all policy (deployed, read, deleted, as in ADR-069's probe).
   Decoded it is a COSE_Sign1. On 2026-11-01:

   - issuer `did:x509:…::eku:1.3.6.1.4.1.311.76.59.1.2`, feed
     `ContainerPlat-AMD-UVM`, chain to Microsoft Supply Chain RSA Root CA 2022,
     signed 2026-03-26;
   - payload `x-ms-sevsnpvm-launchmeasurement` = `dc3f5a93…b9866` (guest SVN
     104), the measurement both groups reported.

   A quick read of the measurement without a COSE library (the payload's
   fields are plain text in the decoded bytes; the pipeline was tested on a
   synthetic file, not re-run on the live one):

   ```bash
   base64 -d < reference-info-base64 |
     grep -a -o -E 'x-ms-sevsnpvm-launchmeasurement[^0-9a-f]*[0-9a-f]{96}'
   ```

   **Honest limit:** the issuer and content were read; the COSE signature was
   not verified cryptographically. Until it is, the pinned measurement rests on
   the issuer string, not on a checked signature.

3. **Write the file** outside the repository, e.g.
   `~/.mvhd/spe-state/reference-values-aci.json`, shaped like
   [`trustee/reference-values-aci.example.json`](../../../trustee/reference-values-aci.example.json):
   11 values. Lists mean "one of", scalars an exact value. The loader refuses a
   file that still contains `REPLACE`.
4. **TCB values are lists, one entry per host seen.** The two groups ran on
   hosts with different TCB: bootloader 10 and 12, microcode 84 and 88, snp 23
   and 28, tee 0. Pin both values of each (#801). The admin job posts lists to
   Trustee's admin API over HTTP inside the ACA environment (#805).
5. `21-aci-confidential-spe.sh --trustee --reference-values ~/.mvhd/spe-state/reference-values-aci.json`
   (log: `11 reference values set`), then `--workspaces` (not restart), then
   `--check`.

When Microsoft updates the UVM, the measurement changes and Trustee refuses
until the new one is checked and pinned: fails safe, and needs this section
again.

## Checking

**The unlock log** (`--check`, or
`az container logs -n mvhd-spe-<n> -g rg-mvhd-dev --container-name spe-unlock`):

```
[spe-loader] platform: SNP device /dev/sev-guest, UVM security context present
[spe-loader] attested: Attested: confidential workload, ear.status affirming
[spe-loader] unlocked; the sidecar loads it
```

`spe-ingest` then prints `loaded; staying up so the pod keeps running`.

**The proxy log** (`az containerapp logs show -n mvhd-neo4j-proxy -g rg-mvhd-dev`):
`connected to Neo4j SPE-1` and `connected to Neo4j SPE-2`, with `tls: true`,
and no `Neo.ClientError.Security.Unauthorized`.

**The page** https://ehds.mabu.red/admin/attestation (EDC_ADMIN), per SPE:

| Field                          | Expected on Azure                                    |
| ------------------------------ | ---------------------------------------------------- |
| Verdict                        | Verified, key released                               |
| Label, Hardware                | Attested: confidential workload                      |
| Scope                          | Workload level; Host data = the permit's policy hash |
| Verifier, Trustee operator     | snp, MedReg DE                                       |
| Measurement                    | `dc3f5a93…b9866` (until Microsoft updates the UVM)   |
| Reported TCB                   | one of the pinned TCB values                         |
| Key released, Workspace loaded | times of this start                                  |
| Environment chip               | Azure                                                |

**The audit tab** `/admin/audit`, tab "Secure processing": per SPE
`spe.attestation`, `spe.key_release`, `spe.workspace_loaded` with
`demo: false`; a replaced load adds `spe.workspace_destroyed`. The proxy syncs
every 60 s, so allow a minute.

**Cold start, measured 2026-11-02:** about 1 minute from `az container start`
to attested and key released; 3 to 4 minutes until both workspaces answer
queries. Until then the proxy leaves a workspace out of federated answers and
keeps retrying. Starting them on demand is planned
([#774](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/774)); it
is not built yet.

## Stopping, starting, costs

```bash
az container stop  -n mvhd-spe-1 -g rg-mvhd-dev
az container stop  -n mvhd-spe-2 -g rg-mvhd-dev
az container start -n mvhd-spe-1 -g rg-mvhd-dev   # fresh start: re-attests, reloads
az container start -n mvhd-spe-2 -g rg-mvhd-dev
az container show  -n mvhd-spe-1 -g rg-mvhd-dev --query instanceView.state -o tsv
```

- A stopped group bills nothing and keeps no row-level data (the store is in
  memory). A start runs `spe-unlock` again, so it re-attests and reloads from
  the sealed extract; this is what you want after pinning, too.
- **Costs:** each group requests 2 vCPU and 5 GB (Neo4j 1.5/4, `spe-ingest`
  0.5/1); at EUR 0.051 per vCPU-hour and EUR 0.0056 per GB-hour (westeurope,
  read 2026-10-31, `ui/src/lib/azure-pricing.ts`) that is about EUR 0.13 an hour
  per group, EUR 0.26 for both, about EUR 37 a month in office hours. The
  2026-11-01 overnight run (about 9 hours, both groups) cost roughly EUR 2.40.
  `mvhd-trustee` is a small ACA app and stops with the others.
- **Off hours:** `offhours.sh` stops both groups first in the evening and
  starts them after `mvhd-trustee` in the morning. The custom role
  `mvhd-aci-power` that `18-offhours-jobs.sh` tries to create cannot be: the
  PIM role has `Microsoft.Authorization/roleDefinitions/write` in its
  notActions. Instead the maintainer gave `id-mvhd-offhours` the built-in
  "Azure Container Instances Contributor Role" on the two groups only. The
  script still warns that it could not create the custom role; that warning is
  expected.

## Troubleshooting by symptom

| Symptom and log line                                                                                                                                                                               | Cause                                                                                                                                                                                                  | Fix                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trustee logs `POST /kbs/v0/auth` 200 every second and no `/kbs/v0/attest`; `spe-unlock`: `RCAR handshake failed … get composite evidence failed … GetEvidence("Failed to get attestation report")` | The attester never produced a report. Trustee v0.22.0's snp-attester asks for the _extended_ report, which ACI does not serve                                                                          | The patched kbs-client ([#798](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/798)), `--trustee` to rebuild                                                                     |
| `GetEvidence("Failed to get attestation report (extended: FirmwareError(UnknownSevError(0)))")` although a plain-report fallback exists                                                            | A failed extended request makes the guest driver drop its VMPCK, so every later request fails, the plain one included (`ENOTTY`; probed on kernel 6.1.10). A fallback after the failure can never work | Ask for the plain report only ([`snp-attester-plain-report.patch`](../../../services/spe-loader/patches/snp-attester-plain-report.patch)); Trustee fetches the VCEK from AMD KDS             |
| `attested: … ear.status contraindicated`, then `refused: Trustee refused default/spe-<n>/extract-key`                                                                                              | First run: nothing pinned yet; or a measurement or TCB not in the pinned values (a new UVM, a new host)                                                                                                | Compare the `pinnable claims` with your file; check a new measurement against the endorsement; add the value to the list; `--trustee --reference-values <file>`, then `--workspaces`         |
| A group that worked is refused after a stop and start                                                                                                                                              | It landed on a host with another TCB                                                                                                                                                                   | Add that host's TCB values to the lists (as above)                                                                                                                                           |
| After pinning and `az container restart`, nothing changes; Trustee sees no request                                                                                                                 | A restart does not re-run the init container `spe-unlock`                                                                                                                                              | `--workspaces` (redeploy) or `az container stop` + `az container start`                                                                                                                      |
| `attested: … ear.status affirming`, then `refused: Trustee refused default/spe-<n>/extract-key (ear.status affirming)`                                                                             | The evidence verified, but the resource policy denied: HOST_DATA is not the policy hash bound for that SPE (template, image or extract changed since `--policy`), or no permit is bound (deny-all)     | `--policy --workspaces`, so the new hash is recorded on the permit and bound                                                                                                                 |
| Proxy: `Neo.ClientError.Security.Unauthorized` for SPE-1/SPE-2; `/admin/attestation` shows no evidence                                                                                             | The Key Vault passwords carried a trailing newline: the shell drops it when the group gets the password, a Key Vault reference keeps it                                                                | Fixed in the proxy ([#809](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/809)) and in `--policy`; rewriting the secrets without the newline also works (the maintainer's call) |
| `AuthorizationFailed` on share `trustee-data` during `--trustee`                                                                                                                                   | `az login` before the PIM activation                                                                                                                                                                   | `az login` again                                                                                                                                                                             |
| `spe-ingest` says `staying up` but its restart count climbs (exit 0)                                                                                                                               | Open in #774                                                                                                                                                                                           | Harmless for the data; nothing to do yet                                                                                                                                                     |
| `spe-unlock` exits after 40 attempts and the group still reports `Succeeded`                                                                                                                       | Fail closed by design: no key, Neo4j starts empty so the refusal can be read and recorded                                                                                                              | Read the attempt errors (each attempt now prints the attester's own error) and fix the cause above                                                                                           |

## Related

[live-demo-off-hours](live-demo-off-hours.md) ·
[query-audit-chain](query-audit-chain.md) ·
[azure-deploy](azure-deploy.md) ·
[docs/gotchas.md](../../gotchas.md) (2026-11-01, 2026-11-02)
