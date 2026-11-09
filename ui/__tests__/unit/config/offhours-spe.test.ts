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
 *   - start: Trustee first; the groups stay stopped and start on demand
 *     (ADR-072), unless SPE_START_WITH_STACK=true restores the old start of
 *     both, in order, after the core apps;
 *   - idle-stop: stops a running group whose last query and start are both
 *     older than SPE_IDLE_STOP_MINUTES (ADR-072).
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
name=$(echo "$*" | sed -n 's/.*--name \\([^ ]*\\).*/\\1/p')
case "$*" in
  *"container show"*"instanceView.state"*)
    cat "$STATE/state-$name" 2>/dev/null; exit 0 ;;
  *"container show"*"currentState.startTime"*)
    cat "$STATE/start-$name" 2>/dev/null; exit 0 ;;
  *"container show --name mvhd-spe-"*)
    for g in $SPE_GROUPS_EXIST; do
      case "$*" in *"--name $g "*) echo "$g"; exit 0 ;; esac
    done
    echo "ResourceNotFound" >&2; exit 3 ;;
  *"containerapp show --name mvhd-trustee"*)
    if [ "$TRUSTEE_EXISTS" = 1 ]; then echo mvhd-trustee; exit 0; fi
    echo "ResourceNotFound" >&2; exit 3 ;;
  *"containerapp show --name mvhd-cfm-"*|*"containerapp show --name mvhd-dp-"*|*"containerapp show --name mvhd-tenant-mgr"*|*"containerapp show --name mvhd-provision-mgr"*)
    for a in $RETIRED_EXIST; do
      case "$*" in *"--name $a "*) echo "$a"; exit 0 ;; esac
    done
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
  action: "stop" | "start" | "idle-stop",
  opts: {
    groups: string[];
    trustee: boolean;
    retired?: string[];
    env?: Record<string, string>;
  },
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
      RETIRED_EXIST: (opts.retired ?? []).join(" "),
      ...(opts.env ?? {}),
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
    // The proxy's /spe/status answers from a file, or not at all.
    "bin/curl":
      '#!/usr/bin/env bash\ncase "$*" in *"/spe/status"*) [ -f "$STATE/spe_status" ] || exit 7; cat "$STATE/spe_status" ;; *) echo 200 ;; esac\n',
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

/**
 * Each run spawns bash and a few dozen stubbed calls; under the full
 * parallel suite one start took 7 s, past Vitest's default 5 s.
 */
const SLOW = { timeout: 30_000 };

const BOTH = { groups: ["mvhd-spe-1", "mvhd-spe-2"], trustee: true };
const NONE = { groups: [], trustee: false };

describe("offhours.sh and the SPE workspaces on ACI (ADR-069)", SLOW, () => {
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

  it("starts Trustee first and leaves both groups stopped: they start on demand (ADR-072)", () => {
    const { status, stderr, log } = run("start", BOTH);
    expect(status, stderr).toBe(0);
    const core = appsOf(log, "set-app-power.sh start");
    expect(core[0]).toBe("mvhd-trustee");
    expect(core).toContain("mvhd-neo4j-proxy");
    expect(log.filter((l) => / container start /.test(l))).toEqual([]);
    expect(stderr).toContain("they start on demand (ADR-072)");
  });

  it("starts both groups, in order, after Trustee, with SPE_START_WITH_STACK=true", () => {
    const { status, stderr, log } = run("start", {
      ...BOTH,
      env: { SPE_START_WITH_STACK: "true" },
    });
    expect(status, stderr).toBe(0);
    const core = appsOf(log, "set-app-power.sh start");
    expect(core[0]).toBe("mvhd-trustee");
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

/** The nine 0.18 apps #927 retires: CFM's managers, agents and shim, JAD's data planes. */
const RETIRED = [
  "mvhd-cfm-obagent",
  "mvhd-cfm-regagent",
  "mvhd-cfm-edcvagent",
  "mvhd-cfm-kcagent",
  "mvhd-cfm-cp-shim",
  "mvhd-provision-mgr",
  "mvhd-tenant-mgr",
  "mvhd-dp-omop",
  "mvhd-dp-fhir",
];

/** Every app any `set-app-power.sh start` call was given, in order. */
const allStarted = (log: string[]) =>
  log
    .filter((l) => l.startsWith("set-app-power.sh start"))
    .flatMap((l) =>
      l.slice("set-app-power.sh start".length).trim().split(/\s+/),
    );

describe("offhours.sh and the retired 0.18 apps (#927)", SLOW, () => {
  it("stops the retired apps that still exist, first, and only those", () => {
    const { status, stderr, log } = run("stop", {
      ...NONE,
      retired: ["mvhd-tenant-mgr", "mvhd-dp-fhir"],
    });
    expect(status, stderr).toBe(0);
    const stopped = appsOf(log, "set-app-power.sh stop");
    expect(stopped.slice(0, 2)).toEqual(["mvhd-tenant-mgr", "mvhd-dp-fhir"]);
    for (const app of RETIRED.filter(
      (a) => a !== "mvhd-tenant-mgr" && a !== "mvhd-dp-fhir",
    )) {
      expect(stopped).not.toContain(app);
    }
    expect(stopped).toContain("mvhd-siglet");
    expect(stopped.indexOf("mvhd-siglet")).toBeLessThan(
      stopped.indexOf("mvhd-controlplane"),
    );
    expect(stderr).toContain("2 retired 0.18 apps still exist (#927)");
  });

  it("stops none of them once step 5 has deleted them", () => {
    const { status, stderr, log } = run("stop", NONE);
    expect(status, stderr).toBe(0);
    const stopped = appsOf(log, "set-app-power.sh stop");
    for (const app of RETIRED) expect(stopped).not.toContain(app);
    expect(stderr).not.toContain("retired 0.18 apps");
  });

  it("never starts them, even while they exist", () => {
    const { status, stderr, log } = run("start", { ...NONE, retired: RETIRED });
    expect(status, stderr).toBe(0);
    const started = allStarted(log);
    for (const app of RETIRED) expect(started).not.toContain(app);
    expect(started).toEqual(
      expect.arrayContaining([
        "mvhd-controlplane",
        "mvhd-siglet",
        "mvhd-identityhub",
        "mvhd-issuerservice",
      ]),
    );
    expect(stderr).not.toContain("CFM");
  });
});

/** 2026-11-02T10:00:00Z, the "now" of every idle-stop run below. */
const NOW = 1793613600;
const iso = (secondsBeforeNow: number) =>
  new Date((NOW - secondsBeforeNow) * 1000).toISOString();

function group(name: string, state: string, startedSecondsAgo?: number) {
  writeFileSync(join(dir, `state-${name}`), `${state}\n`);
  if (startedSecondsAgo !== undefined) {
    writeFileSync(join(dir, `start-${name}`), `${iso(startedSecondsAgo)}\n`);
  }
}

function proxyStatus(lastQueried: Record<string, number | null>) {
  writeFileSync(
    join(dir, "spe_status"),
    JSON.stringify({
      environment: "azure",
      spes: Object.entries(lastQueried).map(([id, ago]) => ({
        id,
        lastQueriedAt: ago === null ? null : iso(ago),
      })),
    }),
  );
}

const idle = (env: Record<string, string> = {}) =>
  run("idle-stop", { ...BOTH, env: { OFFHOURS_NOW: String(NOW), ...env } });

const stops = (log: string[]) =>
  log
    .filter((l) => l.startsWith("az container stop"))
    .map((l) => /--name (\S+)/.exec(l)?.[1]);

describe(
  "offhours.sh idle-stop: a workspace nobody queries stops itself (ADR-072)",
  SLOW,
  () => {
    it("stops the group idle for 30 minutes and keeps the one queried 10 minutes ago", () => {
      group("mvhd-spe-1", "Running", 2 * 3600);
      group("mvhd-spe-2", "Running", 2 * 3600);
      proxyStatus({ "SPE-1": 10 * 60, "SPE-2": 45 * 60 });
      const { status, stderr, log } = idle();
      expect(status, stderr).toBe(0);
      expect(stops(log)).toEqual(["mvhd-spe-2"]);
      expect(stderr).toContain(
        "mvhd-spe-1: last used 10 min ago, keeps running",
      );
    });

    it("keeps a group started on demand 5 minutes ago that nobody has queried yet", () => {
      group("mvhd-spe-1", "Running", 5 * 60);
      group("mvhd-spe-2", "Stopped");
      proxyStatus({ "SPE-1": null, "SPE-2": null });
      const { status, stderr, log } = idle();
      expect(status, stderr).toBe(0);
      expect(stops(log)).toEqual([]);
      expect(stderr).toContain("mvhd-spe-2: Stopped, nothing to stop");
    });

    it("lets the start time decide when the proxy does not answer", () => {
      group("mvhd-spe-1", "Running", 3600);
      group("mvhd-spe-2", "Running", 10 * 60);
      const { status, stderr, log } = idle();
      expect(status, stderr).toBe(0);
      expect(stops(log)).toEqual(["mvhd-spe-1"]);
      expect(stderr).toContain("did not answer");
    });

    it("follows SPE_IDLE_STOP_MINUTES, and 0 turns it off", () => {
      group("mvhd-spe-1", "Running", 3600);
      group("mvhd-spe-2", "Running", 3600);
      proxyStatus({ "SPE-1": 20 * 60, "SPE-2": 5 * 60 });
      expect(stops(idle({ SPE_IDLE_STOP_MINUTES: "15" }).log)).toEqual([
        "mvhd-spe-1",
      ]);
      writeFileSync(join(dir, "all.log"), "");
      expect(stops(idle({ SPE_IDLE_STOP_MINUTES: "0" }).log)).toEqual([]);
    });

    it("leaves a running group without a start time alone, with a warning", () => {
      group("mvhd-spe-1", "Running");
      group("mvhd-spe-2", "Stopped");
      proxyStatus({ "SPE-1": null });
      const { status, stderr, log } = idle();
      expect(status, stderr).toBe(0);
      expect(stops(log)).toEqual([]);
      expect(stderr).toContain("no start time: left running");
    });

    it("stops nothing on a keep-up date, as the evening stop does", () => {
      group("mvhd-spe-1", "Running", 3600);
      group("mvhd-spe-2", "Running", 3600);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
      }).format(new Date());
      const { status, stderr, log } = idle({ KEEP_UP_DATES: today });
      expect(status, stderr).toBe(0);
      expect(stops(log)).toEqual([]);
      expect(stderr).toContain("no idle stop");
    });
  },
);
