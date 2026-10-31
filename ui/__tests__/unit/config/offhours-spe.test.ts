// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * scripts/azure/offhours.sh stops and starts the two SPE workspaces, ACI
 * confidential container groups mvhd-spe-1 and mvhd-spe-2, and the access
 * body's Trustee (mvhd-trustee on ACA) with the rest of the stack (ADR-053,
 * ADR-069), and only once 21-aci-confidential-spe.sh has created them:
 *   - stop: both groups first, in order, then the apps, Trustee among them;
 *   - start: Trustee first, then both groups, in order, while the proxy
 *     (a core app) keeps retrying until the workspaces have loaded.
 * A group or app that does not exist is left out, so the evening stop never
 * fails on a missing resource.
 *
 * The real script runs with `az`, `curl` and `sleep` stubbed on PATH and the
 * scripts it calls replaced by recorders; every call lands in one log, in
 * the order it was made.
 */

const OFFHOURS = resolve(__dirname, "../../../../scripts/azure/offhours.sh");

const AZ_STUB = `#!/usr/bin/env bash
echo "az $*" >> "$STATE/all.log"
case "$*" in
  *"container show --name mvhd-spe-"*)
    for g in $SPE_GROUPS_EXIST; do
      case "$*" in *"--name $g "*) echo "$g"; exit 0 ;; esac
    done
    echo "ResourceNotFound" >&2; exit 3 ;;
  *"containerapp show --name mvhd-trustee"*)
    if [ "$TRUSTEE_EXISTS" = 1 ]; then echo mvhd-trustee; exit 0; fi
    echo "ResourceNotFound" >&2; exit 3 ;;
  *"containerapp update --name mvhd-ui"*"LIVE_DEMO_OFFLINE=true"*) echo true > "$STATE/ui_flag" ;;
  *"containerapp update --name mvhd-ui"*"LIVE_DEMO_OFFLINE=false"*) echo false > "$STATE/ui_flag" ;;
  *LIVE_DEMO_OFFLINE*) cat "$STATE/ui_flag" ;;
  *minReplicas*) echo 0 ;;
  *"flexible-server show"*) cat "$STATE/pg" ;;
  *"flexible-server stop"*) echo Stopped > "$STATE/pg" ;;
  *"flexible-server start"*) echo Ready > "$STATE/pg" ;;
  *ingress.fqdn*) echo ui.example.test ;;
esac
exit 0
`;
const RECORDER = `#!/usr/bin/env bash
echo "$(basename "$0") $*" >> "$STATE/all.log"
exit 0
`;

let dir: string;

function run(
  action: "stop" | "start",
  opts: { groups: string[]; trustee: boolean },
) {
  writeFileSync(join(dir, "pg"), action === "stop" ? "Ready\n" : "Stopped\n");
  writeFileSync(join(dir, "ui_flag"), action === "stop" ? "false\n" : "true\n");
  const result = spawnSync("bash", [join(dir, "offhours.sh"), action], {
    env: {
      PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
      HOME: dir,
      STATE: dir,
      SPE_GROUPS_EXIST: opts.groups.join(" "),
      TRUSTEE_EXISTS: opts.trustee ? "1" : "0",
    },
    encoding: "utf8",
    timeout: 30000,
  });
  const log = readFileSync(join(dir, "all.log"), "utf8").trim().split("\n");
  return { status: result.status, stderr: result.stderr, log };
}

const indexOf = (log: string[], fragment: string) =>
  log.findIndex((l) => l.includes(fragment));

/** The app names a recorded call was given, without the script and verb. */
function appsOf(log: string[], prefix: string): string[] {
  const line = log.find((c) => c.startsWith(prefix));
  expect(line, `no call starting "${prefix}"`).toBeDefined();
  return line!.slice(prefix.length).trim().split(/\s+/);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "offhours-spe-"));
  const bin = join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  copyFileSync(OFFHOURS, join(dir, "offhours.sh"));
  const stubs: Record<string, string> = {
    "bin/az": AZ_STUB,
    "bin/curl": "#!/usr/bin/env bash\necho 200\n",
    "bin/sleep": "#!/usr/bin/env bash\nexit 0\n",
    "set-app-power.sh": RECORDER,
    "retire-stale-revisions.sh": RECORDER,
    "restore-keycloak-realm.sh": RECORDER,
    "check-keycloak-health.sh": RECORDER,
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(dir, name), body);
    chmodSync(join(dir, name), 0o755);
  }
  writeFileSync(join(dir, "all.log"), "");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const BOTH = { groups: ["mvhd-spe-1", "mvhd-spe-2"], trustee: true };
const NONE = { groups: [], trustee: false };

describe("offhours.sh and the SPE workspaces on ACI (ADR-069)", () => {
  it("stops both groups, in order, before the apps, and Trustee with the apps", () => {
    const { status, stderr, log } = run("stop", BOTH);
    expect(status, stderr).toBe(0);
    const one = indexOf(log, "az container stop --name mvhd-spe-1");
    const two = indexOf(log, "az container stop --name mvhd-spe-2");
    const apps = indexOf(log, "set-app-power.sh stop");
    expect(one).toBeGreaterThan(-1);
    expect(two).toBeGreaterThan(one);
    expect(apps).toBeGreaterThan(two);
    const stopped = appsOf(log, "set-app-power.sh stop");
    expect(stopped).toContain("mvhd-trustee");
    expect(stopped.indexOf("mvhd-trustee")).toBeGreaterThan(
      stopped.indexOf("mvhd-neo4j-proxy"),
    );
  });

  it("starts Trustee first, then both groups, in order", () => {
    const { status, stderr, log } = run("start", BOTH);
    expect(status, stderr).toBe(0);
    const core = appsOf(log, "set-app-power.sh start");
    expect(core[0]).toBe("mvhd-trustee");
    expect(core).toContain("mvhd-neo4j-proxy");
    const coreAt = indexOf(log, "set-app-power.sh start");
    const one = indexOf(log, "az container start --name mvhd-spe-1");
    const two = indexOf(log, "az container start --name mvhd-spe-2");
    expect(one).toBeGreaterThan(coreAt);
    expect(two).toBeGreaterThan(one);
  });

  it("stops only the group that exists", () => {
    const { status, stderr, log } = run("stop", {
      groups: ["mvhd-spe-2"],
      trustee: true,
    });
    expect(status, stderr).toBe(0);
    expect(indexOf(log, "az container stop --name mvhd-spe-1")).toBe(-1);
    expect(indexOf(log, "az container stop --name mvhd-spe-2")).toBeGreaterThan(
      -1,
    );
  });

  it("does nothing to SPEs or Trustee while they do not exist, on stop", () => {
    const { status, stderr, log } = run("stop", NONE);
    expect(status, stderr).toBe(0);
    expect(log.filter((l) => / container (stop|start) /.test(l))).toEqual([]);
    const stopped = appsOf(log, "set-app-power.sh stop");
    expect(stopped).not.toContain("mvhd-trustee");
    expect(stopped).toContain("mvhd-neo4j");
  });

  it("does nothing to SPEs or Trustee while they do not exist, on start", () => {
    const { status, stderr, log } = run("start", NONE);
    expect(status, stderr).toBe(0);
    expect(log.filter((l) => / container (stop|start) /.test(l))).toEqual([]);
    expect(appsOf(log, "set-app-power.sh start")).not.toContain("mvhd-trustee");
    expect(appsOf(log, "set-app-power.sh start")).toContain("mvhd-neo4j-proxy");
  });
});
