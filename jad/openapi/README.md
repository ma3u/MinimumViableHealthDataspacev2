# Connector API descriptions

OpenAPI descriptions of the services the hub calls, not of the hub itself. The
hub's own API is `ui/public/openapi.yaml`.

| File                     | Service               | Base path on the compose stack        | Version segment |
| ------------------------ | --------------------- | ------------------------------------- | --------------- |
| `management-api.yaml`    | EDC control plane     | `http://localhost:11003/api/mgmt`     | `/v5`           |
| `identity-api.yaml`      | EDC IdentityHub       | `http://localhost:11005/api/identity` | `/v1`           |
| `issuer-admin-api.yaml`  | EDC IssuerService     | `http://localhost:10013/api/admin`    | `/v1`           |
| `tenant-manager.yaml`    | CFM Tenant Manager    | `http://localhost:11006`              | `/api/v1alpha1` |
| `provision-manager.yaml` | CFM Provision Manager | `http://localhost:11007`              | `/api/v1alpha1` |

## Where they come from, and how far to trust them

They were taken from the JAD repository on 2026-03-09, when the stack ran EDC
0.x and the three EDC files said `/v5alpha` and `/v1alpha`. The stack now runs
the EDC 1.0.0-RC5 launchers in `runtimes/edc/` (ADR-076), which answer only
`/v5` and `/v1`:

| Asked on 2026-11-11, compose stack   | Answer |
| ------------------------------------ | ------ |
| `GET /api/mgmt/v5/participants`      | 200    |
| `GET /api/mgmt/v5beta/participants`  | 404    |
| `GET /api/mgmt/v5alpha/participants` | 404    |
| `GET /api/identity/v1/participants`  | 200    |
| `GET /api/identity/v1alpha/...`      | 404    |
| `POST /api/admin/v1alpha/...`        | 404    |

So the version segments in the three EDC files were renamed on 2026-11-11, and
every path was then asked for on the running services: all 36 Management API
paths, all 13 Identity API paths and all 8 Issuer Admin API paths exist under
the new segment. That is all that was checked. The request and response
schemas are still the March ones and were not compared with the 1.0 sources,
and operations EDC 1.0 added (the hub uses `PUT .../profiles` and
`PUT .../dataplanes`, `ui/src/lib/edc/provision.ts`) are not in these files.
Regenerating them from the EDC 1.0 release is open.

A deployment still on EDC 0.18 serves `/v5beta`; the hub's client rewrites the
segment from `EDC_MGMT_API_VERSION` (`ui/src/lib/edc/client.ts`).

## What exercises the real services

`bruno/MVHDv2/10 Connecting partner` sends twenty requests to the Management
API, IdentityHub and IssuerService of a local stack, DSP 2025-1 and DCP v1.0
included: `./scripts/run-api-tests.sh Local "10 Connecting partner"`.
