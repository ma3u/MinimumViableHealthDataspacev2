// Phase 18: Trust Center & Federated Pseudonym Resolution — Seed Data
// EHDS Art. 50 (Secure Processing Environment) + Art. 51 (Cross-Border)
//
// Run after init-schema.cypher and insert-synthetic-schema-data.cypher:
//   cat neo4j/seed-trust-center.cypher | docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace

// ============================================================
// 1. Trust Center nodes (Layer 1 extension)
// ============================================================

// DE: Robert Koch Institute — designated German national trust center
MERGE (tc_de:TrustCenter {name: "RKI Trust Center DE"})
SET tc_de += {
  operatedBy: "Robert Koch Institute",
  country: "DE",
  status: "active",
  protocol: "deterministic-pseudonym-v1",
  endpoint: "https://trustcenter.rki.de/resolve",
  did: "did:web:rki.de:trustcenter",
  createdAt: datetime("2025-01-01T00:00:00Z"),
  description: "German national trust center designated under EHDS Art. 50. " +
               "Implements stateless HMAC-based pseudonym resolution for " +
               "cross-provider longitudinal patient linkage."
};

// NL: RIVM (Rijksinstituut voor Volksgezondheid en Milieu)
MERGE (tc_nl:TrustCenter {name: "RIVM Trust Center NL"})
SET tc_nl += {
  operatedBy: "Rijksinstituut voor Volksgezondheid en Milieu",
  country: "NL",
  status: "active",
  protocol: "deterministic-pseudonym-v1",
  endpoint: "https://trustcenter.rivm.nl/resolve",
  did: "did:web:rivm.nl:trustcenter",
  createdAt: datetime("2025-02-01T00:00:00Z"),
  description: "Dutch national trust center under HDAB authority. " +
               "Supports cross-border mutual recognition with DE/RKI " +
               "under EHDS Art. 51."
};

// ============================================================
// 2. HDAB Approval → Trust Center governance relationships
// ============================================================

// Link both trust centers to the MedReg DE HDAB approval
MATCH (ha:HDABApproval)
WHERE ha.approvalId IN ["hdab-approval-001", "hdab-approval-002"]
MERGE (tc_de:TrustCenter {name: "RKI Trust Center DE"})
MERGE (tc_de)-[:GOVERNED_BY]->(ha);

// ============================================================
// 3. Trust Center → HealthDataset resolution scope
// ============================================================

MATCH (ds:HealthDataset)
WHERE ds.datasetId IN [
  "dataset-fhir-alphaklinik",
  "dataset-fhir-lmc",
  "dataset-omop-alphaklinik"
]
MERGE (tc_de:TrustCenter {name: "RKI Trust Center DE"})
MERGE (tc_de)-[:RESOLVES_PSEUDONYMS_FOR]->(ds);

MATCH (ds:HealthDataset)
WHERE ds.datasetId IN ["dataset-fhir-lmc"]
MERGE (tc_nl:TrustCenter {name: "RIVM Trust Center NL"})
MERGE (tc_nl)-[:RESOLVES_PSEUDONYMS_FOR]->(ds);

// ============================================================
// 4. Cross-border mutual recognition
// ============================================================

MERGE (tc_de:TrustCenter {name: "RKI Trust Center DE"})
MERGE (tc_nl:TrustCenter {name: "RIVM Trust Center NL"})
MERGE (tc_de)-[:MUTUALLY_RECOGNISES {
  since: date("2025-03-01"),
  framework: "EHDS Art. 51",
  status: "active"
}]->(tc_nl)
MERGE (tc_nl)-[:MUTUALLY_RECOGNISES {
  since: date("2025-03-01"),
  framework: "EHDS Art. 51",
  status: "active"
}]->(tc_de);

// ============================================================
// 5. Sample SPE Sessions (TEE-attested)
// ============================================================

MERGE (spe1:SPESession {sessionId: "spe-session-001"})
SET spe1 += {
  studyId: "study-diabetes-de-nl-2025",
  status: "active",
  attestation: "sha256:a3f8c2e1d4b7f6a9c0e2d5b8a1f4c7e0d3b6a9c2e5d8b1a4f7c0e3d6b9a2c5e8",
  approvedCodeHash: "sha256:c7e0d3b6a9c2e5d8b1a4f7c0e3d6b9a2c5e8a3f8c2e1d4b7f6a9c0e2d5b8a1f4",
  createdAt: datetime("2025-03-15T09:00:00Z"),
  createdBy: "did:web:medreg.de:hdab",
  kAnonymityThreshold: 5,
  outputPolicy: "aggregate-only"
};

MERGE (spe2:SPESession {sessionId: "spe-session-002"})
SET spe2 += {
  studyId: "study-cardio-nl-2025",
  status: "completed",
  attestation: "sha256:b4g9d3f2e5c8g1h4i7j0k3l6m9n2o5p8q1r4s7t0u3v6w9x2y5z8a1b4c7d0e3f6",
  approvedCodeHash: "sha256:d8c1b4a7f0e3d6c9b2a5f8e1d4c7b0a3f6e9d2c5b8a1f4e7d0c3b6a9f2e5d8c1",
  createdAt: datetime("2025-02-10T14:30:00Z"),
  createdBy: "did:web:medreg.de:hdab",
  kAnonymityThreshold: 5,
  outputPolicy: "aggregate-only"
};

// ============================================================
// 6. Sample Provider Pseudonyms (never exposed to researchers)
// ============================================================

MERGE (pp1:ProviderPseudonym {psnId: "psn-alphaklinik-pat001"})
SET pp1 += {
  providerId: "did:web:alpha-klinik.de:participant",
  studyId: "study-diabetes-de-nl-2025",
  createdAt: datetime("2025-03-15T09:05:00Z")
};

MERGE (pp2:ProviderPseudonym {psnId: "psn-lmc-pat001"})
SET pp2 += {
  providerId: "did:web:lmc.nl:clinic",
  studyId: "study-diabetes-de-nl-2025",
  createdAt: datetime("2025-03-15T09:05:00Z")
};

// ============================================================
// 7. Sample Research Pseudonyms (issued by Trust Center, SPE-only)
// ============================================================

MERGE (rp1:ResearchPseudonym {rpsnId: "rpsn-study-diabetes-patient-A"})
SET rp1 += {
  studyId: "study-diabetes-de-nl-2025",
  revoked: false,
  issuedBy: "did:web:rki.de:trustcenter",
  issuedAt: datetime("2025-03-15T09:06:00Z"),
  mode: "stateless"
};

// Link provider pseudonyms → research pseudonym
MERGE (pp1:ProviderPseudonym {psnId: "psn-alphaklinik-pat001"})
MERGE (pp2:ProviderPseudonym {psnId: "psn-lmc-pat001"})
MERGE (rp1:ResearchPseudonym {rpsnId: "rpsn-study-diabetes-patient-A"})
MERGE (rp1)-[:LINKED_FROM]->(pp1)
MERGE (rp1)-[:LINKED_FROM]->(pp2);

// Link research pseudonym → SPE session
MERGE (rp1:ResearchPseudonym {rpsnId: "rpsn-study-diabetes-patient-A"})
MERGE (spe1:SPESession {sessionId: "spe-session-001"})
MERGE (rp1)-[:USED_IN]->(spe1);

// ============================================================
// 8. Trust Center → SPE Session governance
// ============================================================

MERGE (tc_de:TrustCenter {name: "RKI Trust Center DE"})
MERGE (spe1:SPESession {sessionId: "spe-session-001"})
MERGE (tc_de)-[:MANAGES]->(spe1);

MERGE (tc_nl:TrustCenter {name: "RIVM Trust Center NL"})
MERGE (spe2:SPESession {sessionId: "spe-session-002"})
MERGE (tc_nl)-[:MANAGES]->(spe2);
