# ADR-036: Operator secrets live in Azure Key Vault and are referenced, never copied

**Status:** Proposed
**Date:** 2026-09-13
**Relates to:** [ADR-034](ADR-034-claude-workload-identity-federation.md), [ADR-035](ADR-035-inference-provider-residency-and-quota.md), [ADR-029](ADR-029-dependency-version-pinning.md)
**Tracks:** [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)

## Context

`scripts/azure/env.sh` carried this, committed, in a public repository:

```bash
export KC_ADMIN_USER="admin"
export KC_ADMIN_PASSWORD="admin"
```

That was a defensible trade while Keycloak guarded a demo realm of fictional
participants on a stack that could be rebuilt from scratch in an afternoon. The
`.gitleaksignore` even records the same reasoning for the other dev credentials:
in-memory Vault, local Postgres, all reset on restart.

**ADR-034 changed what that password protects.** The same Keycloak now issues
the identity tokens that authorise paid inference, and ADR-035 attaches a
spending limit to the subject in those tokens. Anyone who can administer the
realm can mint a user, or move another user's subject into the allowlist, and
spend the operator's money. The host is publicly reachable by design, because a
phone has to reach it.

A credential that guarded a demo now guards a budget. The trade that was
reasonable stopped being reasonable, and it did so without anybody editing the
line that made it.

## Decision

**Operator secrets live in Azure Key Vault. Scripts and deployments hold a
reference to them, never a copy.**

```
vault      kv-mvhd-b53a0449        RBAC, purge protection on
secret     keycloak-admin-password 40 characters, generated, never displayed
operator   Key Vault Secrets Officer   read and write
workload   Key Vault Secrets User      read only
```

Three properties, each chosen:

1. **RBAC, not access policies.** Access policies are per-vault lists that drift
   from the rest of the subscription's authorisation model. RBAC puts vault
   access in the same place as every other permission, so revoking someone
   revokes them everywhere.

2. **Least privilege by role.** The operator can write secrets; the workload can
   only read them. The Container App has no path to rewrite the credential it
   uses, which means a compromise of the service cannot lock the operator out of
   it.

3. **Referenced, not copied.** `env.sh` resolves the value lazily through
   `kc_admin_password()` at the point of use, and the Container App holds a
   `keyvaultref:` secret resolved by its managed identity rather than a literal
   in its environment. A copied secret is a secret with two lifetimes, and the
   second one is the one nobody rotates.

Purge protection is on because Azure Policy requires it here, which is the
policy being right: a vault that can be hard-deleted is a vault whose contents
can be destroyed by one mistaken command.

## Consequences

### Positive

- The repository no longer contains a working credential for a
  publicly-reachable service that gates spending.
- Rotation is a single `az keyvault secret set` plus one admin-API call; nothing
  needs editing, committing or redeploying.
- The service can read its own secret without any human handing it one, which is
  the same principle as ADR-034: the system proves what it is rather than
  storing what it knows.

### Trade-offs

- **`az login` is now required for anything that touches Keycloak.** The scripts
  warn clearly rather than failing obscurely, but a developer without vault
  access can no longer run them at all. That is the point, and it is still a
  cost.
- **One more Azure resource** to exist, pay for and keep in the deployment
  scripts.
- **Conditional access makes tokens short-lived here**, so `az login` will be
  needed more often than is comfortable.

### What this deliberately does not do

- **The other dev credentials stay as they are.** Neo4j, Postgres and the
  in-memory HashiCorp Vault root token remain literals in `env.sh`. They guard
  synthetic data on a stack designed to be rebuilt, they are reset on every
  restart, and moving them would be motion rather than security. The distinction
  that matters is not "is it a password" but "what does it protect, and who can
  reach it". Keycloak crossed that line; they have not.
- **It does not rotate anything on a schedule.** Rotation is now cheap enough to
  do, which is a precondition for doing it regularly, not a substitute.

## References

- [Azure Key Vault RBAC guide](https://learn.microsoft.com/azure/key-vault/general/rbac-guide)
- `.gitleaksignore`, which records the original reasoning for the dev-credential exceptions
- [ADR-034](ADR-034-claude-workload-identity-federation.md), which changed what this password protects
