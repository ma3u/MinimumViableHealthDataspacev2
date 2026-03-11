/**
 * Unit tests for Neo4j driver wrapper (ui/src/lib/neo4j.ts)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock neo4j-driver before importing the module under test
vi.mock("neo4j-driver", () => {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn(),
  };
  const mockDriver = {
    session: vi.fn(() => mockSession),
    close: vi.fn(),
  };
  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user: string, pass: string) => ({ user, pass })),
      },
    },
    __mockDriver: mockDriver,
    __mockSession: mockSession,
  };
});

import neo4j from "neo4j-driver";

// We need to import after mocking
const { __mockDriver, __mockSession } = (await import("neo4j-driver")) as any;

describe("Neo4j Library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module to clear cached driver
    vi.resetModules();
  });

  describe("getDriver", () => {
    it("should create a driver with default connection settings", async () => {
      const { getDriver } = await import("@/lib/neo4j");
      const driver = getDriver();
      expect(driver).toBeDefined();
      expect(neo4j.driver).toHaveBeenCalledWith(
        "bolt://localhost:7687",
        expect.anything(),
        expect.objectContaining({ disableLosslessIntegers: true }),
      );
    });

    it("should reuse the cached driver on subsequent calls", async () => {
      const { getDriver } = await import("@/lib/neo4j");
      const driver1 = getDriver();
      const driver2 = getDriver();
      expect(driver1).toBe(driver2);
      // Only one call to neo4j.driver() even though getDriver() called twice
      expect(neo4j.driver).toHaveBeenCalledTimes(1);
    });
  });

  describe("runQuery", () => {
    it("should execute a Cypher query and return records as objects", async () => {
      const mockRecords = [
        { toObject: () => ({ id: "1", name: "Alice" }) },
        { toObject: () => ({ id: "2", name: "Bob" }) },
      ];
      __mockSession.run.mockResolvedValue({ records: mockRecords });

      const { runQuery } = await import("@/lib/neo4j");
      const result = await runQuery<{ id: string; name: string }>(
        "MATCH (n:Patient) RETURN n.id AS id, n.name AS name",
      );

      expect(result).toEqual([
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ]);
      expect(__mockSession.run).toHaveBeenCalledWith(
        "MATCH (n:Patient) RETURN n.id AS id, n.name AS name",
        {},
      );
      expect(__mockSession.close).toHaveBeenCalled();
    });

    it("should pass parameters to the Cypher query", async () => {
      __mockSession.run.mockResolvedValue({ records: [] });

      const { runQuery } = await import("@/lib/neo4j");
      await runQuery("MATCH (n:Patient {id: $id}) RETURN n", { id: "123" });

      expect(__mockSession.run).toHaveBeenCalledWith(
        "MATCH (n:Patient {id: $id}) RETURN n",
        { id: "123" },
      );
    });

    it("should close session even when query throws", async () => {
      __mockSession.run.mockRejectedValue(new Error("Connection failed"));

      const { runQuery } = await import("@/lib/neo4j");
      await expect(runQuery("MATCH (n) RETURN n")).rejects.toThrow(
        "Connection failed",
      );

      expect(__mockSession.close).toHaveBeenCalled();
    });

    it("should return empty array when no records found", async () => {
      __mockSession.run.mockResolvedValue({ records: [] });

      const { runQuery } = await import("@/lib/neo4j");
      const result = await runQuery("MATCH (n:Missing) RETURN n");

      expect(result).toEqual([]);
    });
  });
});
