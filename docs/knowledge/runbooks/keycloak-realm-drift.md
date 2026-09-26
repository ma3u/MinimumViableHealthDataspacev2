---
type: runbook
title: Keycloak realm drift — diagnose and reconcile
description: What to do when logins fail on the deployed Keycloak although the realm file looks correct.
resource: incident 2026-07-15 (issue-less; PR #95), jad/keycloak-realm.json, scripts/azure/06-post-deploy.sh
tags: [runbook, keycloak, incident, auth]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

**Root cause pattern:** realm import returns HTTP 409 on an existing realm and
imports NOTHING — users, roles, and client changes added to
`jad/keycloak-realm.json` after the first import never reach the deployed
instance.

**Symptoms seen 2026-07-15:** `Invalid parameter: redirect_uri` (client had
localhost-only URIs) and `Invalid username or password` (user didn't exist).

**Diagnose:**

1. `az containerapp logs show -n mvhd-keycloak -g rg-mvhd-dev --tail 100`
   — look for `LOGIN_ERROR … error="invalid_redirect_uri"` or user lookups.
2. Admin API (`https://auth.ehds.mabu.red`): token from
   `/realms/master/protocol/openid-connect/token` (admin creds in
   `scripts/azure/env.sh` — dev-grade), then GET
   `/admin/realms/edcv/clients?clientId=health-dataspace-ui` and
   `/admin/realms/edcv/users` — diff against the realm file.

**Reconcile:** run `./scripts/provision-keycloak-sso.sh`. It derives roles,
users, passwords and role mappings from `jad/keycloak-realm.json`, applies them
idempotently, and then verifies every account can obtain a token — exiting
non-zero if any cannot, so drift fails loudly. Point it elsewhere with
`KC_HOST` / `KC_ADMIN_PASSWORD`. Client redirect URIs are still a manual PUT.

Recurrence 2026-09-08 (local stack): `patient1` could not log in. The realm had
neither the `DATA_HOLDER`, `DATA_USER` nor `PATIENT` roles, was missing the
`lmcuser`, `patient1` and `patient2` users outright, and `clinicuser` /
`researcher` were each missing their second role — so two accounts that _did_
log in were carrying the wrong authorisation. Cause: the provisioning script
hardcoded three roles, three users, and **one role per user**, and had not been
updated as the realm file grew. It now reads the realm file, so it cannot drift
that way again. Production was unaffected: `reset-demo` deletes and re-imports
the realm, which picks up the whole file.
`06-post-deploy.sh` now verifies redirect URIs and exits non-zero on drift;
`ui/__tests__/unit/config/keycloak-realm.test.ts` pins the production URIs.

## Recurrence 2026-09-26: a client that only ever existed at runtime

Third instance, and a different mechanism from the two above. The realm file
was imported correctly; a script then **added** to the realm afterwards, and
only on some stacks.

`jad/seed-jad.sh` created the `issuer` Keycloak client (Vault access and the
issuer-admin API, claims `participant_context_id=issuer` and
`role=participant`) through the admin API at runtime. It runs as the compose
service `jad-seed`, which sits behind `profiles: [seed]` and is started only by
`scripts/bootstrap-jad.sh`. CI's `compliance.yml` does
`docker compose -f docker-compose.jad.yml up -d`, never activates the profile,
and so has never had the client. Every seed that authenticates as `issuer`
(`seed-issuer-defs.sh`, `seed-ehds-credentials.sh`, `issue-ehds-credentials.sh`)
failed there with `Could not get issuer token from Keycloak`.

Nobody noticed for the same reason as the other entries in #338: the three DCP
checks that depend on those seeds (`ISS-4.3`, `VC-3.2`, `VC-3.3`) had no
reachable failure branch until #341, so an IssuerService with no definitions
and participants with no credentials scored as passes.

**Fix:** the client is now declared in `jad/keycloak-realm.json`, field for
field as the script created it, and pinned by
`ui/__tests__/unit/config/keycloak-realm.test.ts`, which runs in the pre-commit
Vitest hook and the PR Gate. Removing it fails the build. `seed-jad.sh` still
runs its create; against an imported realm it now takes the "may already
exist" branch, which is the correct one.

**The rule this adds:** a realm object lives in the realm file. A script may
_reconcile_ what the file declares, idempotently; it may not be the only place
an object is defined. Anything created only by a script exists only where that
script runs, and the environments where it does not run will pass every check
that cannot fail and no check that can.

## The realm has vanished entirely

Different failure from drift, same blast radius. Symptom:

```
$ curl -s https://auth.ehds.mabu.red/realms/edcv/.well-known/openid-configuration
{"error":"Realm does not exist"}
```

while `/realms/master` answers 200. Keycloak is healthy, Postgres is up, the
realm row is simply not there. Every sign-in on the live UI fails and all seven
demo personas are gone with it. Seen on 2026-09-14, two days before a regulator
demo.

Fix:

```bash
KEYCLOAK_PUBLIC_HOSTNAME=auth.ehds.mabu.red \
  ./scripts/azure/restore-keycloak-realm.sh --check   # report only
KEYCLOAK_PUBLIC_HOSTNAME=auth.ehds.mabu.red \
  ./scripts/azure/restore-keycloak-realm.sh           # import it
```

`06-post-deploy.sh` also imports the realm, but it redeploys half the estate on
the way, which is not what you want ten minutes before a demo.

Two things that make this recoverable, both worth preserving:

- `jad/keycloak-realm.json` pins the `health-dataspace-ui` client secret. If it
  did not, a re-import would mint a fresh secret and the UI's stored one would
  no longer match, turning a working login into a token-exchange failure that
  looks nothing like the original problem.
- The same file already lists the `ehds.mabu.red` redirect URIs, so a plain
  re-import restores working logins without touching the client. The redirect
  step in the script only matters when the ACA FQDN has changed.

Verify with the real thing rather than with discovery alone:

```bash
cd ui && PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
  KEYCLOAK_PUBLIC_URL=https://auth.ehds.mabu.red \
  npx playwright test 18-user-login-roles.spec.ts --project=chromium
```

21 tests, real Keycloak sign-in for all seven personas plus RBAC. Discovery
answering 200 only proves the realm exists; this proves people can get in.

### Why it vanishes: it does not survive a restart

Observed twice on 2026-09-14. Found missing during demo prep, re-imported, the
full login suite passed 21/21 against the live URL. Then a merge to `main`
triggered `deploy-azure.yml`, the stack came back up, and within minutes:

```
$ curl -s https://auth.ehds.mabu.red/realms/edcv/.well-known/openid-configuration
{"error":"Realm does not exist"}
```

`deploy-azure.yml` only reads Keycloak's FQDN and runs tests against it. It
never imports or deletes a realm. What it does do is create new container
revisions, which restarts Keycloak.

So the realm is not surviving a Keycloak restart. **The cause is that
Postgres has no storage.** Keycloak is configured correctly:

```
KC_DB       postgres
KC_DB_URL   jdbc:postgresql://mvhd-postgres:5432/keycloak?sslmode=disable
```

Postgres is not:

```
$ az containerapp show -n mvhd-postgres -g rg-mvhd-dev \
    --query "{volumes:properties.template.volumes, \
              mounts:properties.template.containers[0].volumeMounts}"
{ "volumes": [ { "name": "pgdata", "storageName": "pg-data",
                 "storageType": "AzureFile" } ],
  "mounts": null }
```

The volume is **declared and never mounted**. `PGDATA` points at
`/var/lib/postgresql/data/pgdata` inside the container's own filesystem, so
every restart takes the whole database with it: the Keycloak realm, and the EDC
and CFM state alongside it.

`02-data-layer.sh` creates the app and then patches the YAML to attach the
volume, and that second step is not in effect on the running revision. Either
it never applied, or a later `az containerapp update` dropped `volumeMounts`,
which is easy to do because the CLI rewrites the template.

Two checks confirm it. Neo4j and Vault, provisioned by the same two-step
pattern, both have their mounts (2/2 and 1/1) while Postgres has 1 volume and 0
mounts, which is why graph data survives and logins do not. And the Azure File
share itself contains an empty `pgdata/` directory: had the mount ever been
live, it would hold a real cluster (`base/`, `pg_wal/`, `PG_VERSION`). Postgres
has been ephemeral for its entire life in this deployment.

**The fix is to re-attach the mount**, which restarts Postgres, initialises a
fresh cluster into the share, and requires re-importing the realm afterwards.
Nothing durable is lost, because nothing there was ever durable, but the EDC
stack restarts with it, so it is not a thing to do an hour before a demo.

What makes this bite daily rather than occasionally is `aca-schedule.yml`,
which scales the whole stack to zero at 18:00 UTC and back up on weekday
mornings. Every stop/start is a restart, so every day is another chance to lose
the realm, and nothing announces it: the UI stays up and every sign-in fails.

Until the cause is found, the start job re-imports the realm on every start
("Ensure the Keycloak realm exists"). That is a bandage on the symptom, and it
is named as one in the workflow so nobody mistakes it for the fix.

### Set KEYCLOAK_PUBLIC_URL, or the verification verifies nothing

`skipIfKeycloakDown()` probes `KEYCLOAK_PUBLIC_URL`, which defaults to
`http://localhost:8080`. Point `PLAYWRIGHT_BASE_URL` at a deployment without
also setting it and all 21 tests skip against a local Keycloak that is not the
one serving that deployment:

```
21 skipped
```

which reads like a clean run at a glance. That is how a missing realm survived
a verification on 2026-09-14. The helper now throws instead of skipping when
the base URL is remote and the Keycloak URL is not, so the mistake fails loudly.

Two things about the Azure session are worth knowing when restoring by hand.
The management-plane (ARM) token and the Key Vault data-plane token expire
independently: `az group show` can fail with AADSTS70043 while
`az keyvault secret show` still works. The restore script only needs the data
plane, so it can succeed when `az` looks broken. It skips the redirect-URI step
in that case, which is safe, because `jad/keycloak-realm.json` already carries
the `ehds.mabu.red` URIs.
