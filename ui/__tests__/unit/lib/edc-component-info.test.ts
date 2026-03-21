/**
 * Tests for EDC component-info metadata and edc/index barrel export
 */
import { describe, it, expect } from "vitest";
import { COMPONENT_INFO } from "@/lib/edc/component-info";
import type { ComponentMeta } from "@/lib/edc/component-info";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";

describe("COMPONENT_INFO", () => {
  const components = Object.entries(COMPONENT_INFO);

  it("should define all 20 EDC components", () => {
    expect(components.length).toBeGreaterThanOrEqual(20);
  });

  it("should include all core infrastructure components", () => {
    const names = Object.keys(COMPONENT_INFO);
    expect(names).toContain("Control Plane");
    expect(names).toContain("Data Plane FHIR");
    expect(names).toContain("Data Plane OMOP");
    expect(names).toContain("Identity Hub");
    expect(names).toContain("Issuer Service");
    expect(names).toContain("Keycloak");
    expect(names).toContain("Vault");
    expect(names).toContain("Neo4j");
    expect(names).toContain("Traefik");
    expect(names).toContain("PostgreSQL");
    expect(names).toContain("NATS");
    expect(names).toContain("UI");
  });

  it("should include CFM components", () => {
    const names = Object.keys(COMPONENT_INFO);
    expect(names).toContain("Tenant Manager");
    expect(names).toContain("Provision Manager");
    expect(names).toContain("EDC-V Agent");
    expect(names).toContain("Keycloak Agent");
    expect(names).toContain("Registration Agent");
    expect(names).toContain("Onboarding Agent");
  });

  it("each component should have all required fields", () => {
    for (const [name, meta] of components) {
      expect(meta.description, `${name} missing description`).toBeTruthy();
      expect(meta.protocol, `${name} missing protocol`).toBeTruthy();
      expect(meta.ports, `${name} missing ports`).toBeDefined();
      expect(
        Array.isArray(meta.dependsOn),
        `${name} dependsOn should be array`,
      ).toBe(true);
      expect(meta.healthSource, `${name} missing healthSource`).toBeTruthy();
    }
  });

  it("dependency references should point to existing components", () => {
    const names = new Set(Object.keys(COMPONENT_INFO));
    for (const [name, meta] of components) {
      for (const dep of meta.dependsOn) {
        expect(
          names.has(dep),
          `${name} depends on "${dep}" which is not in COMPONENT_INFO`,
        ).toBe(true);
      }
    }
  });

  it("infrastructure components should have no dependencies", () => {
    const infra = ["PostgreSQL", "Vault", "NATS", "Neo4j", "Traefik"];
    for (const name of infra) {
      expect(COMPONENT_INFO[name].dependsOn).toEqual([]);
    }
  });

  it("Control Plane should depend on PostgreSQL, Vault, and NATS", () => {
    const cp = COMPONENT_INFO["Control Plane"];
    expect(cp.dependsOn).toContain("PostgreSQL");
    expect(cp.dependsOn).toContain("Vault");
    expect(cp.dependsOn).toContain("NATS");
  });

  it("Data Planes should depend on Control Plane", () => {
    expect(COMPONENT_INFO["Data Plane FHIR"].dependsOn).toContain(
      "Control Plane",
    );
    expect(COMPONENT_INFO["Data Plane OMOP"].dependsOn).toContain(
      "Control Plane",
    );
  });
});

describe("edc/index barrel export", () => {
  it("should export edcClient", () => {
    expect(edcClient).toBeDefined();
    expect(typeof edcClient.management).toBe("function");
  });

  it("should export EDC_CONTEXT string", () => {
    expect(typeof EDC_CONTEXT).toBe("string");
    expect(EDC_CONTEXT).toContain("edc");
  });
});
