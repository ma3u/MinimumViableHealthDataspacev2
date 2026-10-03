/**
 * The reading of CFM provisioning activities that tells "provisioning" apart
 * from "nothing is ever going to complete this" (issue #203).
 */
import { describe, it, expect } from "vitest";
import {
  summariseVpas,
  stalledReason,
  provisioningFailed,
  provisioningComplete,
  PROVISIONING_STALL_MS,
} from "@/lib/provisioning";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const vpa = (type: string, state: string, stateTimestamp: string) => ({
  id: `${type}-id`,
  type,
  state,
  stateTimestamp,
});

const THREE_PENDING = (at: string) => [
  {
    vpas: [
      vpa("cfm.connector", "pending", at),
      vpa("cfm.credentialservice", "pending", at),
      vpa("cfm.dataplane", "pending", at),
    ],
  },
];

describe("summariseVpas", () => {
  it("reports nothing for a tenant with no profiles", () => {
    expect(summariseVpas(undefined, NOW).total).toBe(0);
    expect(summariseVpas([], NOW).stalled).toBe(false);
  });

  it("reports a profile with no activities as neither pending nor stalled", () => {
    const s = summariseVpas([{ vpas: [] }], NOW);
    expect(s.total).toBe(0);
    expect(s.stalled).toBe(false);
  });

  it("does not call a just-created registration stalled", () => {
    const s = summariseVpas(THREE_PENDING(ago(30_000)), NOW);
    expect(s.total).toBe(3);
    expect(s.pending).toBe(3);
    expect(s.stalled).toBe(false);
  });

  it("calls it stalled once every activity has been pending past the threshold", () => {
    const s = summariseVpas(
      THREE_PENDING(ago(PROVISIONING_STALL_MS + 60_000)),
      NOW,
    );
    expect(s.stalled).toBe(true);
    expect(s.pendingTypes).toEqual([
      "cfm.connector",
      "cfm.credentialservice",
      "cfm.dataplane",
    ]);
    expect(s.oldestPendingSince).toBe(ago(PROVISIONING_STALL_MS + 60_000));
  });

  it("holds off exactly at the threshold", () => {
    expect(
      summariseVpas(THREE_PENDING(ago(PROVISIONING_STALL_MS)), NOW).stalled,
    ).toBe(false);
  });

  it("is not stalled when one activity has completed, however old the rest", () => {
    // Something is working on it, however slowly, and calling that stalled
    // would be the same overstatement in the other direction.
    const old = ago(PROVISIONING_STALL_MS * 10);
    const s = summariseVpas(
      [
        {
          vpas: [
            vpa("cfm.connector", "completed", old),
            vpa("cfm.credentialservice", "pending", old),
            vpa("cfm.dataplane", "pending", old),
          ],
        },
      ],
      NOW,
    );
    expect(s.pending).toBe(2);
    expect(s.stalled).toBe(false);
  });

  it("counts activities across every profile of the tenant", () => {
    const old = ago(PROVISIONING_STALL_MS * 2);
    const s = summariseVpas(
      [
        { vpas: [vpa("cfm.connector", "pending", old)] },
        { vpas: [vpa("cfm.dataplane", "pending", old)] },
      ],
      NOW,
    );
    expect(s.total).toBe(2);
    expect(s.stalled).toBe(true);
  });

  it("does not call it stalled when no timestamp can be read", () => {
    // An unparseable timestamp says nothing about how long this has been
    // pending, and guessing "stalled" from it would be a fabricated claim.
    const s = summariseVpas(
      [{ vpas: [{ type: "cfm.connector", state: "pending" }] }],
      NOW,
    );
    expect(s.pending).toBe(1);
    expect(s.oldestPendingSince).toBeNull();
    expect(s.stalled).toBe(false);
  });

  it("survives a profile whose vpas field is not an array", () => {
    const s = summariseVpas(
      [{ vpas: undefined }, { vpas: "nonsense" } as never],
      NOW,
    );
    expect(s.total).toBe(0);
  });
});

describe("stalledReason", () => {
  it("names the activities and says no DID was registered", () => {
    const reason = stalledReason(
      summariseVpas(THREE_PENDING(ago(PROVISIONING_STALL_MS * 3)), NOW),
    );
    expect(reason).toContain("cfm.connector");
    expect(reason).toContain("no provisioning agent has completed them");
    expect(reason).toContain("no DID was registered");
    // Says when the agents run, not that they are absent (2026-10-03).
    expect(reason).toContain("07:00 to 20:00 Europe/Berlin");
    expect(reason).not.toMatch(/does not run/);
  });

  it("reads correctly for a single pending activity", () => {
    const summary = summariseVpas(
      [
        {
          vpas: [
            vpa("cfm.connector", "pending", ago(PROVISIONING_STALL_MS * 3)),
          ],
        },
      ],
      NOW,
    );
    expect(stalledReason(summary)).toContain("has been pending");
    expect(stalledReason(summary)).toContain("completed it");
  });
});

// Measured on 2026-10-03: a provisioned profile has every activity "active"
// and error false; one the agents gave up on has error true and its
// activities "error" or "disposed". The identifier is no signal, the route
// sends it with the profile.
describe("provisioningFailed and provisioningComplete", () => {
  const act = (state: string) => ({ type: "cfm.connector", state });

  it("reads a rolled-back profile as failed, never complete", () => {
    const profiles = [
      { error: true, vpas: [act("disposed"), act("disposed")] },
    ];
    expect(provisioningFailed(profiles)).toBe(true);
    expect(provisioningComplete(profiles)).toBe(false);
  });

  it("reads a profile with every activity active as complete", () => {
    const profiles = [{ error: false, vpas: [act("active"), act("active")] }];
    expect(provisioningFailed(profiles)).toBe(false);
    expect(provisioningComplete(profiles)).toBe(true);
  });

  it("is neither while an activity is pending, or with no activities", () => {
    const pending = [{ error: false, vpas: [act("active"), act("pending")] }];
    expect(provisioningFailed(pending)).toBe(false);
    expect(provisioningComplete(pending)).toBe(false);
    expect(provisioningComplete([{ vpas: [] }])).toBe(false);
    expect(provisioningComplete(undefined)).toBe(false);
  });
});
