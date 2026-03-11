/**
 * API route tests for GET /api/patient
 *
 * Tests list mode (no patientId) and timeline mode (with patientId).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/patient/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/patient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list mode (no patientId)", () => {
    it("should return patients list and cohort stats", async () => {
      const mockPatients = [
        {
          id: "pat-001",
          name: "Alice Smith",
          gender: "female",
          birthDate: "1990-01-01",
        },
        {
          id: "pat-002",
          name: "Bob Jones",
          gender: "male",
          birthDate: "1985-06-15",
        },
      ];
      const mockStats = {
        patients: 2,
        encounters: 10,
        conditions: 5,
        observations: 20,
        medications: 3,
        procedures: 1,
      };

      mockRunQuery
        .mockResolvedValueOnce(mockPatients)
        .mockResolvedValueOnce([mockStats]);

      const req = new Request("http://localhost:3000/api/patient");
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.patients).toHaveLength(2);
      expect(data.stats).toEqual(mockStats);
      expect(data.timeline).toEqual([]);
    });

    it("should handle empty patient list", async () => {
      mockRunQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const req = new Request("http://localhost:3000/api/patient");
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.patients).toEqual([]);
      expect(data.stats).toEqual({});
    });
  });

  describe("timeline mode (with patientId)", () => {
    it("should return FHIR timeline for a specific patient", async () => {
      const mockTimeline = [
        {
          fhirType: "Condition",
          fhirId: "cond-001",
          date: "2023-01-15",
          display: "Diabetes",
          omopType: "OMOPConditionOccurrence",
          omopId: "omop-cond-001",
        },
        {
          fhirType: "Observation",
          fhirId: "obs-001",
          date: "2023-02-10",
          display: "HbA1c",
          omopType: "OMOPMeasurement",
          omopId: "omop-meas-001",
        },
      ];

      mockRunQuery.mockResolvedValue(mockTimeline);

      const req = new Request(
        "http://localhost:3000/api/patient?patientId=pat-001",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.timeline).toHaveLength(2);
      expect(data.timeline[0].fhirType).toBe("Condition");
      expect(mockRunQuery).toHaveBeenCalledWith(
        expect.stringContaining("$patientId"),
        { patientId: "pat-001" },
      );
    });

    it("should return empty timeline for unknown patient", async () => {
      mockRunQuery.mockResolvedValue([]);

      const req = new Request(
        "http://localhost:3000/api/patient?patientId=unknown",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.timeline).toEqual([]);
    });
  });
});
