// Phase 18: Trust Center & Federated Pseudonym Resolution — Seed Data
// EHDS Art. 50 (Secure Processing Environment) + Art. 51 (Cross-Border)
//
// Run after init-schema.cypher and insert-synthetic-schema-data.cypher:
//   cat neo4j/seed-trust-center.cypher | docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace

// ============================================================
// 1. Trust Center nodes (Layer 1 extension)
// ============================================================

// DE: fictional, like every participant here. See .claude/rules/code-style.md.
MERGE (tc_de:TrustCenter {name: "MedReg DE Trust Centre"})
SET tc_de += {
  operatedBy: "MedReg DE",
  country: "DE",
  status: "active",
  protocol: "deterministic-pseudonym-v1",
  endpoint: "https://trustcentre.medreg.de/resolve",
  did: "did:web:medreg.de:trustcentre",
  createdAt: datetime("2025-01-01T00:00:00Z"),
  description: "German national trust center designated under EHDS Art. 50. " +
               "Implements stateless HMAC-based pseudonym resolution for " +
               "cross-provider longitudinal patient linkage."
};

// NL: fictional, paired with the Limburg Medical Centre data holder.
MERGE (tc_nl:TrustCenter {name: "Limburg Trust Centre NL"})
SET tc_nl += {
  operatedBy: "Limburg Medical Centre",
  country: "NL",
  status: "active",
  protocol: "deterministic-pseudonym-v1",
  endpoint: "https://trustcentre.lmc.nl/resolve",
  did: "did:web:lmc.nl:trustcentre",
  createdAt: datetime("2025-02-01T00:00:00Z"),
  description: "Dutch national trust center under HDAB authority. " +
               "Supports cross-border mutual recognition with the German " +
               "under EHDS Art. 51."
};

// ============================================================
// 2. HDAB Approval → Trust Center governance relationships
// ============================================================

// Link both trust centers to the MedReg DE HDAB approval
MATCH (ha:HDABApproval)
WHERE ha.approvalId IN ["hdab-approval-001", "hdab-approval-002"]
MERGE (tc_de:TrustCenter {name: "MedReg DE Trust Centre"})
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
MERGE (tc_de:TrustCenter {name: "MedReg DE Trust Centre"})
MERGE (tc_de)-[:RESOLVES_PSEUDONYMS_FOR]->(ds);

MATCH (ds:HealthDataset)
WHERE ds.datasetId IN ["dataset-fhir-lmc"]
MERGE (tc_nl:TrustCenter {name: "Limburg Trust Centre NL"})
MERGE (tc_nl)-[:RESOLVES_PSEUDONYMS_FOR]->(ds);

// ============================================================
// 4. Cross-border mutual recognition
// ============================================================

MERGE (tc_de:TrustCenter {name: "MedReg DE Trust Centre"})
MERGE (tc_nl:TrustCenter {name: "Limburg Trust Centre NL"})
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
  attestation: "sha256:a59aa00a8540f63528fd8e9c1731fed118a82b68cf03d65780e9053ae6f0a7d0",
  approvedCodeHash: "sha256:a92de975fd6a22a6eb6cb760c67937829bc9f3c7da49362afca2a54f3ad9dc67",
  createdAt: datetime("2025-03-15T09:00:00Z"),
  createdBy: "did:web:medreg.de:hdab",
  kAnonymityThreshold: 5,
  outputPolicy: "aggregate-only",
  // Attestation shape per ADR-037. Simulated in this seed: no confidential
  // node produced these. The field names and lengths match what Contrast
  // actually yields, so phase 2 substitutes real values without a migration.
  simulated: true,
  teeType: "AMD SEV-SNP",
  policyHash: "sha256:c2775865d3e11ffe183c42f114177cf5899bf95467b2d8430f966a42800a653c",
  coordinatorEndpoint: "coordinator.spe.internal:1313",
  attestedAt: datetime("2025-03-15T09:02:11Z"),
  verifiedBy: "did:web:medreg.de:hdab"
};

MERGE (spe2:SPESession {sessionId: "spe-session-002"})
SET spe2 += {
  studyId: "study-cardio-nl-2025",
  status: "completed",
  attestation: "sha256:da8c5c1d580565ce2210b65560c09a298f7f63e512b01fe404df7ecfbad20ac5",
  approvedCodeHash: "sha256:5c14374f008bf035388906c6ac732b59bb27b69ab7a70ab17d08d85c932158f2",
  createdAt: datetime("2025-02-10T14:30:00Z"),
  createdBy: "did:web:medreg.de:hdab",
  kAnonymityThreshold: 5,
  outputPolicy: "aggregate-only",
  // Attestation shape per ADR-037. Simulated in this seed: no confidential
  // node produced these. The field names and lengths match what Contrast
  // actually yields, so phase 2 substitutes real values without a migration.
  simulated: true,
  teeType: "AMD SEV-SNP",
  policyHash: "sha256:e938dd986b73e1939f83182761e550a902ebcbb528d6685bec118f2e72c4074c",
  coordinatorEndpoint: "coordinator.spe.internal:1313",
  attestedAt: datetime("2025-03-15T09:02:11Z"),
  verifiedBy: "did:web:medreg.de:hdab"
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

MERGE (tc_de:TrustCenter {name: "MedReg DE Trust Centre"})
MERGE (spe1:SPESession {sessionId: "spe-session-001"})
MERGE (tc_de)-[:MANAGES]->(spe1);

MERGE (tc_nl:TrustCenter {name: "Limburg Trust Centre NL"})
MERGE (spe2:SPESession {sessionId: "spe-session-002"})
MERGE (tc_nl)-[:MANAGES]->(spe2);
