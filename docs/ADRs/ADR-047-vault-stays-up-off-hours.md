# ADR-047: Vault stays up off-hours until it keeps its own state

**Status:** Proposed
**Date:** 2026-10-03
**Relates to:** [ADR-017](ADR-017-persistent-storage-aca.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md)
**Supersedes:** the `mvhd-vault` entry in the stop list of [ADR-042](ADR-042-off-hours-scaledown-current-state.md)
**Tracks:** [#455](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/455)

## Context

`mvhd-vault` on Azure runs `vault server -dev`: the app has no command, and its
environment holds `VAULT_DEV_ROOT_TOKEN_ID` and `VAULT_DEV_LISTEN_ADDRESS`.
Everything it holds lives in memory. ADR-017 mounted the `vault-data` share at
`/vault/data` for a file backend, but Vault was never switched to it, and
ADR-042 left the question open.

ADR-042's evening stop sets every listed app to `min=0`. In Container Apps that is
a revision change, so the stop restarts Vault. Measured on 2026-10-02: the stop
started at 21:54, revision `mvhd-vault--0000175` was created at 21:55, and the
log reads `security barrier not initialized` and then `no mounts; adding default
mount table`, a new Vault with nothing in it.

Vault does not then reach zero. Its internal ingress is called by the EDC
services, and on Saturday 2026-10-03 it was running one replica at `min=0`, as
were the UI, the control plane and the CFM agents. So the stop saves nothing on
Vault. Its only effect is to empty it.

The next refill is the weekday 07:00 start, which re-runs `mvhd-vault-bootstrap`.
Every night, weekend and holiday the stack therefore runs without the
provisioner JWT role, the IssuerService and data plane keys, and every
participant key written since the last start. The CFM Keycloak and EDC-V agents
log in to Vault at launch and crash without it (#455).

An update to the same min and max is a no-op: `mvhd-keycloak`, which left the
stop list on 2026-09-13, got a revision on 2026-09-14 05:15, when it went from 0
to 1, and none on the mornings after.

## Decision

Take `mvhd-vault` out of the evening stop in `.github/workflows/aca-schedule.yml`.
It stays at 1/1. The morning start still runs its 1/1 update, which is then a
no-op, and still re-runs the bootstrap, which tolerates a Vault that already
holds its mounts and roles.

This holds until Vault keeps its own state on ACA. When it does, this ADR is
superseded and Vault may rejoin the stop list.

## Consequences

- Vault keeps its state across nights and weekends. It still loses everything
  on any real restart: a deploy that changes its template, an ACA platform
  move, a crash. The bootstrap restores the parts it writes, not participant
  keys.
- Cost does not change, because Vault was not reaching zero.
- The stop list has 17 apps, not 18.

## Alternatives considered

- **Re-run the bootstrap after the evening stop.** It restores the provisioner
  role and the bootstrap's keys, but not the participant keys the stop wipes,
  and it keeps a nightly restart that does nothing useful.
- **Run Vault with file storage on `/vault/data` now, as the compose stack does
  since 2026-09-26.** That is the real fix, and it is not a one-line change:
  every EDC service authenticates with the dev root token `root`, a real
  server issues its own, and the unseal key needs a home (a share, or Key Vault
  auto-unseal per ADR-036). It deserves its own ADR and a measured rollout.
  Tracked in #455.
