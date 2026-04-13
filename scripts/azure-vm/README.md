# Single-VM Dev Deployment (ADR-015)

Budget-constrained personal dev environment on a Visual Studio Enterprise Azure
subscription (~50 EUR/month credit). Runs the full 19-service JAD stack on one
`Standard_B4ms` VM weekdays 07:00–20:00 Europe/Berlin.

See [ADR-015](../../docs/ADRs/ADR-015-single-vm-dev-deployment.md) for rationale.

**Not a substitute for [ADR-012](../../docs/ADRs/ADR-012-azure-container-apps.md)** —
the team-shared Container Apps environment in `scripts/azure/` is independent.

## Prerequisites

```bash
az login
az account set --subscription "PER-MSD-VS-MBUCHHORN-01"   # or your VS sub
ls ~/.ssh/id_rsa.pub                                       # or export VM_SSH_KEY=<path>
```

## Deploy

```bash
cd scripts/azure-vm
./deploy.sh              # full provisioning, ~3 min
DRY_RUN=1 ./deploy.sh    # print az commands without running them
```

The script is idempotent — re-running only updates what drifted.

### What it creates

| Resource                | Name                                        | Cost (monthly est.) |
| ----------------------- | ------------------------------------------- | ------------------- |
| Resource group          | `rg-mvhd-vm-dev`                            | —                   |
| VM                      | `mvhd-dev` (B4ms, 4 vCPU / 16 GB)           | ~€48 at 286 h       |
| OS disk                 | 64 GB Premium SSD                           | ~€5                 |
| Network security group  | `nsg-mvhd-dev` (SSH locked to your IP)      | —                   |
| Public IP               | Standard SKU                                | ~€3                 |
| Auto-shutdown schedule  | daily 20:00 CET                             | free                |
| Logic App (Consumption) | `la-mvhd-dev-startup` — weekday 07:00 start | ~€0                 |

**Expected total: ~€53/month** — tight against a 50 EUR credit. If you want a
comfort margin, edit `env.sh`:

```bash
export SHUTDOWN_TIME=1900   # stop at 19:00 instead of 20:00
export STARTUP_HOUR=8        # start at 08:00 instead of 07:00
```

That brings it to ~€40/month.

## First boot timeline

After `./deploy.sh` returns:

- **0–90 s** — cloud-init installs Docker + clones the repo
- **90 s–3 min** — `docker compose up -d` pulls images (~4 GB)
- **3–5 min** — containers start, `bootstrap-jad.sh` re-seeds Vault
- **5–8 min** — Neo4j ready, UI healthy at `http://<public-ip>:3000`

SSH in to watch:

```bash
ssh azureuser@$(az vm show -d -g rg-mvhd-vm-dev -n mvhd-dev --query publicIps -o tsv)
sudo systemctl status health-dataspace.service
sudo journalctl -u health-dataspace.service -f
cd /opt/mvhd && docker compose ps
```

## Schedule behaviour

- **Stop**: native VM auto-shutdown (free), daily at `SHUTDOWN_TIME` local tz.
  No email notification configured — add `--email you@example.com` to the
  `az vm auto-shutdown` call in `deploy.sh` if you want the 30-min warning.
- **Start**: Logic App with managed identity, weekday 07:00 only. Check runs:

  ```bash
  az logic workflow show -g rg-mvhd-vm-dev -n la-mvhd-dev-startup \
    --query "{state:state, lastRun:changedTime}"
  ```

- **Manual override**:

  ```bash
  az vm start -g rg-mvhd-vm-dev -n mvhd-dev
  az vm deallocate -g rg-mvhd-vm-dev -n mvhd-dev   # fully stops billing
  ```

  `az vm stop` alone does NOT stop billing — use `deallocate`.

## Vault-in-memory handling

CLAUDE.md gotcha #1: Vault loses all secrets on every stop. The systemd unit
re-runs `scripts/bootstrap-jad.sh` on every `ExecStartPost`, so keycloak,
signing keys, and JWT auth backends are re-seeded automatically. Expect ~60 s
extra startup time vs. a warm boot.

## Teardown

```bash
./teardown.sh
```

Prompts for the RG name as a safety check, then deletes asynchronously.

## Troubleshooting

| Symptom                                          | Fix                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `az vm auto-shutdown` rule in UTC instead of CET | deploy.sh sets `timeZoneId` after creation; re-run `./deploy.sh`                                                                |
| Logic App doesn't trigger start                  | check role assignment: `az role assignment list --scope <vm-id> --assignee-object-id <principalId>`                             |
| Compose stack won't start                        | `ssh` in, check `docker compose logs`, verify `vm.max_map_count=262144`                                                         |
| Public IP changed after stop                     | expected — Standard SKU is static **while allocated**, but a fresh public IP is cheap. For a stable DNS, add an Azure DNS zone. |
| 429 / quota errors                               | VS subs have low regional vCPU quotas; request increase via portal, or try `northeurope`                                        |
