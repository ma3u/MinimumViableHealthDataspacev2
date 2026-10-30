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
 * scripts/azure/offhours.sh stops and starts SPE-2 (ADR-069) with the rest
 * of the stack, and only once scripts/azure/20-neo4j-spe2.sh has created it:
 * set-app-power.sh fails on an app that does not exist, so naming SPE-2
 * before it exists would fail every evening stop.
 *
 * The real script runs here with `az`, `curl` and `sleep` stubbed on PATH
 * and the scripts it calls replaced by recorders, so the test sees exactly
 * which apps each step was given, in order.
 */

const OFFHOURS = resolve(__dirname, "../../../../scripts/azure/offhours.sh");

const AZ_STUB = `#!/usr/bin/env bash
echo "az $*" >> "$STATE/az.log"
case "$*" in
  *"containerapp show --name mvhd-neo4j-spe2"*)
    if [ "$SPE2_EXISTS" = 1 ]; then echo mvhd-neo4j-spe2; exit 0; fi
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
echo "$(basename "$0") $*" >> "$STATE/calls.log"
exit 0
`;

let dir: string;

function run(action: "stop" | "start", spe2Exists: boolean) {
  writeFileSync(join(dir, "pg"), action === "stop" ? "Ready\n" : "Stopped\n");
  writeFileSync(join(dir, "ui_flag"), action === "stop" ? "false\n" : "true\n");
  const result = spawnSync("bash", [join(dir, "offhours.sh"), action], {
    env: {
      PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
      HOME: dir,
      STATE: dir,
      SPE2_EXISTS: spe2Exists ? "1" : "0",
    },
    encoding: "utf8",
    timeout: 30000,
  });
  const calls = readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n");
  const az = readFileSync(join(dir, "az.log"), "utf8").trim().split("\n");
  return { status: result.status, stderr: result.stderr, calls, az };
}

/** The app names a recorded call was given, without the script and verb. */
function appsOf(calls: string[], prefix: string): string[] {
  const line = calls.find((c) => c.startsWith(prefix));
  expect(line, `no call starting "${prefix}"`).toBeDefined();
  return line!.slice(prefix.length).trim().split(/\s+/);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "offhours-spe2-"));
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
  writeFileSync(join(dir, "calls.log"), "");
  writeFileSync(join(dir, "az.log"), "");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("offhours.sh and SPE-2 (ADR-069)", () => {
  it("stops SPE-2 right after SPE-1, once the proxy has stopped", () => {
    const { status, stderr, calls } = run("stop", true);
    expect(status, stderr).toBe(0);
    const apps = appsOf(calls, "set-app-power.sh stop");
    expect(apps).toContain("mvhd-neo4j-spe2");
    expect(apps.indexOf("mvhd-neo4j-spe2")).toBe(
      apps.indexOf("mvhd-neo4j") + 1,
    );
    expect(apps.indexOf("mvhd-neo4j-proxy")).toBeLessThan(
      apps.indexOf("mvhd-neo4j-spe2"),
    );
  });

  it("leaves SPE-2 out of the stop while it does not exist", () => {
    const { status, stderr, calls } = run("stop", false);
    expect(status, stderr).toBe(0);
    const apps = appsOf(calls, "set-app-power.sh stop");
    expect(apps).not.toContain("mvhd-neo4j-spe2");
    expect(apps).toContain("mvhd-neo4j");
  });

  it("starts SPE-2 before the proxy, at one replica, without a stale revision", () => {
    const { status, stderr, calls, az } = run("start", true);
    expect(status, stderr).toBe(0);
    // The first start is the core apps; SPE-2 leads it.
    const core = appsOf(calls, "set-app-power.sh start");
    expect(core[0]).toBe("mvhd-neo4j-spe2");
    expect(core).toContain("mvhd-neo4j-proxy");
    expect(appsOf(calls, "retire-stale-revisions.sh mvhd-neo4j")).toEqual([
      "mvhd-neo4j-spe2",
    ]);
    expect(
      az.some(
        (l) =>
          l.includes("containerapp update --name mvhd-neo4j-spe2") &&
          l.includes("--min-replicas 1 --max-replicas 1"),
      ),
    ).toBe(true);
  });

  it("starts the stack without SPE-2 while it does not exist", () => {
    const { status, stderr, calls, az } = run("start", false);
    expect(status, stderr).toBe(0);
    expect(calls.join("\n")).not.toContain("mvhd-neo4j-spe2");
    expect(
      az.filter(
        (l) =>
          l.includes("mvhd-neo4j-spe2") && !l.includes("containerapp show"),
      ),
    ).toEqual([]);
    expect(appsOf(calls, "set-app-power.sh start")).toContain(
      "mvhd-neo4j-proxy",
    );
  });
});
