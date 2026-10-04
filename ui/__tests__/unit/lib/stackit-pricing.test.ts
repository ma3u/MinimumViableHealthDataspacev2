import { describe, it, expect } from "vitest";
import { STACKIT_SERVERS, stackitCost } from "@/lib/stackit-pricing";
import { ACA_APP_SPECS } from "@/app/admin/components/_components/constants";

describe("stackitCost", () => {
  it("prices the three servers from the price list", () => {
    const cost = stackitCost(5);
    // g2i.2 + g2i.4 + g2i.2 at 730 h
    expect(cost.serversEur).toBeCloseTo(298.67, 1);
  });

  it("prices PostgreSQL Flex 2.4 with storage class, capacity and backup", () => {
    // 91.97 flavor + 14.70 perf2 + 2.12 capacity + 0.86 backup
    expect(stackitCost(5).pgFlexEur).toBeCloseTo(109.65, 1);
  });

  it("adds data and logs per participant, not servers", () => {
    const five = stackitCost(5);
    const fifty = stackitCost(50);
    expect(fifty.sharedEur).toBe(five.sharedEur);
    expect(fifty.participantsEur).toBeGreaterThan(five.participantsEur);
    expect(fifty.participantsEur / 50).toBeLessThan(2);
  });

  it("gives the Azure apps (without the container Postgres) enough memory", () => {
    const azureGiB = ACA_APP_SPECS.filter(
      (a) => a.name !== "mvhd-postgres",
    ).reduce((s, a) => s + a.memGiB, 0);
    const stackitGb = STACKIT_SERVERS.reduce((s, n) => s + n.ramGb, 0);
    expect(stackitGb).toBeGreaterThan(azureGiB);
  });
});
