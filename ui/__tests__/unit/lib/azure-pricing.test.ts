import { describe, it, expect } from "vitest";
import {
  aciGroupMonthlyEur,
  costForApp,
  costForEnvironment,
  formatEur,
  OFFICE_HOURS_PER_MONTH,
  pgFlexMonthlyEur,
} from "@/lib/azure-pricing";
import {
  ACA_APP_SPECS,
  ACI_SPE_GROUPS,
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
    // 21 apps with the SPE Trustee (#774), all stopped off hours (ADR-053):
    // about €302 compute and €370 in all
    expect(cost.apps).toHaveLength(21);
    expect(cost.apps.every((a) => a.idleEur === 0)).toBe(true);
    expect(cost.computeEur).toBeGreaterThan(260);
    expect(cost.computeEur).toBeLessThan(330);
    expect(cost.totalEur).toBeGreaterThan(330);
    expect(cost.totalEur).toBeLessThan(400);
  });

  it("adds nothing for SPE workspaces when there are none", () => {
    expect(cost.aciEur).toBe(0);
    expect(cost.aciGroups).toEqual([]);
  });

  it("charges no egress inside the free 100 GiB", () => {
    expect(cost.egressEur).toBe(0);
    expect(
      costForEnvironment([], { ...inputs, egressGiB: 110 }).egressEur,
    ).toBeCloseTo(0.704, 3);
  });
});

describe("aciGroupMonthlyEur (the SPE workspaces of ADR-069, #774)", () => {
  it("sizes each group from its containers: neo4j 1.5/4 and spe-ingest 0.5/1", () => {
    expect(ACI_SPE_GROUPS.map((g) => g.name)).toEqual([
      "mvhd-spe-1",
      "mvhd-spe-2",
    ]);
    const g = aciGroupMonthlyEur(ACI_SPE_GROUPS[0]);
    expect(g.cpu).toBe(2);
    expect(g.memGiB).toBe(5);
  });

  it("bills a group office hours at the confidential ACI rates", () => {
    const g = aciGroupMonthlyEur(ACI_SPE_GROUPS[0]);
    // 2 vCPU x EUR 0.051 + 5 GB x EUR 0.0056 = EUR 0.130 an hour
    expect(g.hourlyEur).toBeCloseTo(0.13, 4);
    // for 281.67 office hours
    expect(g.totalEur).toBeCloseTo(36.62, 1);
  });

  it("bills around the clock only when a group is never stopped", () => {
    const g = aciGroupMonthlyEur({ ...ACI_SPE_GROUPS[0], schedule: "always" });
    expect(g.totalEur).toBeCloseTo(94.9, 1);
  });

  it("adds both groups to the environment total", () => {
    const without = costForEnvironment(ACA_APP_SPECS, inputs);
    const withSpes = costForEnvironment(ACA_APP_SPECS, {
      ...inputs,
      aciGroups: ACI_SPE_GROUPS,
    });
    expect(withSpes.aciGroups).toHaveLength(2);
    expect(withSpes.aciEur).toBeCloseTo(73.23, 1);
    expect(withSpes.totalEur - without.totalEur).toBeCloseTo(
      withSpes.aciEur,
      6,
    );
  });
});

describe("formatEur", () => {
  it("drops the cents from three digits on", () => {
    expect(formatEur(12.345)).toBe("€12.35");
    expect(formatEur(431.6)).toBe("€432");
  });
});
