import { describe, it, expect } from "vitest";
import {
  costForApp,
  costForEnvironment,
  formatEur,
  OFFICE_HOURS_PER_MONTH,
  pgFlexMonthlyEur,
} from "@/lib/azure-pricing";
import {
  ACA_APP_SPECS,
  AZURE_PG_FLEX,
} from "@/app/admin/components/_components/constants";

const inputs = {
  pgFlex: AZURE_PG_FLEX,
  fileSharesGib: 37,
  logAnalyticsGb: 18.3,
  egressGiB: 7,
};

describe("costForApp", () => {
  it("bills an office-hours app only for the hours the schedule runs it", () => {
    const app = costForApp({
      name: "a",
      cpu: 1,
      memGiB: 2,
      schedule: "office",
    });
    expect(OFFICE_HOURS_PER_MONTH).toBeCloseTo(281.67, 2);
    expect(app.idleEur).toBe(0);
    // 1 vCPU and 2 GiB for 281.67 h at the billed rates
    expect(app.totalEur).toBeCloseTo(26.26 + 6.17, 1);
  });

  it("bills an always-on app the idle rate when the office is closed", () => {
    const app = costForApp({
      name: "kc",
      cpu: 1,
      memGiB: 2,
      schedule: "always",
    });
    expect(app.idleEur).toBeGreaterThan(0);
    expect(app.idleEur).toBeLessThan(app.activeEur);
  });
});

describe("pgFlexMonthlyEur", () => {
  it("bills the live B1ms compute in office hours and storage always", () => {
    const pg = pgFlexMonthlyEur(AZURE_PG_FLEX);
    // ADR-053 stops it off hours: 281.67 h, not 730
    expect(pg.computeEur).toBeCloseTo(4.93, 2);
    expect(pg.storageEur).toBeCloseTo(3.86, 2);
  });

  it("bills a server kept up around the clock for 730 h", () => {
    const pg = pgFlexMonthlyEur({ ...AZURE_PG_FLEX, schedule: "always" });
    expect(pg.computeEur).toBeCloseTo(12.78, 2);
  });

  it("prices an unknown SKU at zero rather than guessing", () => {
    expect(
      pgFlexMonthlyEur({
        name: "x",
        sku: "Nope",
        storageGb: 0,
        schedule: "office",
      }).totalEur,
    ).toBe(0);
  });
});

describe("costForEnvironment", () => {
  const cost = costForEnvironment(ACA_APP_SPECS, inputs);

  it("adds up compute, the Flexible Server and the platform services", () => {
    expect(cost.totalEur).toBeCloseTo(
      cost.computeEur +
        cost.pgFlexEur +
        cost.filesEur +
        cost.registryEur +
        cost.logsEur +
        cost.egressEur,
      6,
    );
    expect(cost.computeEur).toBe(cost.grossComputeEur - cost.freeCreditEur);
  });

  it("keeps the live stack in the range the schedule predicts", () => {
    // 20 apps, all stopped off hours (ADR-053): about €294 compute and
    // €362 in all
    expect(cost.apps).toHaveLength(20);
    expect(cost.apps.every((a) => a.idleEur === 0)).toBe(true);
    expect(cost.computeEur).toBeGreaterThan(260);
    expect(cost.computeEur).toBeLessThan(330);
    expect(cost.totalEur).toBeGreaterThan(330);
    expect(cost.totalEur).toBeLessThan(400);
  });

  it("charges no egress inside the free 100 GiB", () => {
    expect(cost.egressEur).toBe(0);
    expect(
      costForEnvironment([], { ...inputs, egressGiB: 110 }).egressEur,
    ).toBeCloseTo(0.704, 3);
  });
});

describe("formatEur", () => {
  it("drops the cents from three digits on", () => {
    expect(formatEur(12.345)).toBe("€12.35");
    expect(formatEur(431.6)).toBe("€432");
  });
});
