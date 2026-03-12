// =============================================================================
// Seed file: Audit & Provenance — DataTransfer + ContractNegotiation nodes
// Participants and HealthDataset nodes are assumed to already exist.
// Run: cat neo4j/seed-audit-provenance.cypher | docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace
// =============================================================================

// ── 1. Ensure provenance indexes ─────────────────────────────────────────────
CREATE INDEX data_transfer_id    IF NOT EXISTS FOR (t:DataTransfer)          ON (t.id);
CREATE INDEX negotiation_id      IF NOT EXISTS FOR (n:ContractNegotiation)   ON (n.id);
CREATE INDEX transfer_status     IF NOT EXISTS FOR (t:DataTransfer)          ON (t.status);
CREATE INDEX negotiation_status  IF NOT EXISTS FOR (n:ContractNegotiation)   ON (n.status);

// ── 2. Ensure Participant nodes for the demo tenants ─────────────────────────
MERGE (p_alphaklinik:Participant {participantId: "did:web:alpha-klinik.de:participant"})
  SET p_alphaklinik.name            = "AlphaKlinik Berlin",
      p_alphaklinik.participantType = "CLINIC",
      p_alphaklinik.country         = "DE";

MERGE (p_pharmaco:Participant {participantId: "did:web:pharmaco.de:research"})
  SET p_pharmaco.name              = "PharmaCo Research AG",
      p_pharmaco.participantType   = "CRO",
      p_pharmaco.country           = "DE";

MERGE (p_medreg:Participant {participantId: "did:web:medreg.de:hdab"})
  SET p_medreg.name              = "MedReg DE",
      p_medreg.participantType   = "HDAB",
      p_medreg.country           = "DE";

MERGE (p_lmc:Participant {participantId: "did:web:lmc.nl:clinic"})
  SET p_lmc.name            = "Limburg Medical Centre",
      p_lmc.participantType = "CLINIC",
      p_lmc.country         = "NL";

MERGE (p_irs:Participant {participantId: "did:web:irs.fr:hdab"})
  SET p_irs.name            = "Institut de Recherche Sant\u00e9",
      p_irs.participantType = "HDAB",
      p_irs.country         = "FR";

// ── 3. Ensure HealthDataset/DataAsset nodes used in transfers ─────────────────
MERGE (ds_t2d:HealthDataset {id: "dataset:synthea-fhir-r4-mvd"})
  SET ds_t2d.name = "T2D Patient Journey Dataset (FHIR R4)";

MERGE (ds_omop:HealthDataset {id: "dataset:omop-cdm-v54-analytics"})
  SET ds_omop.name = "OMOP CDM v5.4 Analytics Cohort";

MERGE (ds_pca:HealthDataset {id: "dataset:prostate-cancer-registry"})
  SET ds_pca.name = "Prostate Cancer Registry 2024";

// ── 4. Contract Negotiations ──────────────────────────────────────────────────

// NEG-001  CONFIRMED  AlphaKlinik Berlin → PharmaCo Research AG  (T2D FHIR)
MERGE (n1:ContractNegotiation {id: "neg-001"})
  SET n1.status              = "CONFIRMED",
      n1.timestamp           = "2026-01-15T09:12:00Z",
      n1.negotiationDate     = "2026-01-15",
      n1.contractId          = "contract-fhir-t2d-001",
      n1.consumerDid         = "did:web:pharmaco.de:research",
      n1.providerDid         = "did:web:alpha-klinik.de:participant",
      n1.consumerCountry     = "DE",
      n1.providerCountry     = "DE",
      n1.crossBorder         = false,
      n1.policyId            = "policy:ehds-research-use",
      n1.assetId             = "dataset:synthea-fhir-r4-mvd"
WITH n1
MATCH (consumer:Participant {participantId: "did:web:pharmaco.de:research"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:synthea-fhir-r4-mvd"})
MERGE (n1)-[:NEGOTIATED_BY]->(consumer)
MERGE (n1)-[:OFFERED_BY]->(provider)
MERGE (n1)-[:FOR_ASSET]->(asset);

// NEG-002  FINALIZED  AlphaKlinik Berlin → PharmaCo Research AG  (OMOP Analytics)
MERGE (n2:ContractNegotiation {id: "neg-002"})
  SET n2.status              = "FINALIZED",
      n2.timestamp           = "2026-01-22T14:05:00Z",
      n2.negotiationDate     = "2026-01-22",
      n2.contractId          = "contract-omop-analytics-002",
      n2.consumerDid         = "did:web:pharmaco.de:research",
      n2.providerDid         = "did:web:alpha-klinik.de:participant",
      n2.consumerCountry     = "DE",
      n2.providerCountry     = "DE",
      n2.crossBorder         = false,
      n2.policyId            = "policy:ehds-research-use",
      n2.assetId             = "dataset:omop-cdm-v54-analytics"
WITH n2
MATCH (consumer:Participant {participantId: "did:web:pharmaco.de:research"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:omop-cdm-v54-analytics"})
MERGE (n2)-[:NEGOTIATED_BY]->(consumer)
MERGE (n2)-[:OFFERED_BY]->(provider)
MERGE (n2)-[:FOR_ASSET]->(asset);

// NEG-003  CONFIRMED  MedReg DE ← Limburg Medical Centre (cross-border DE←NL)
MERGE (n3:ContractNegotiation {id: "neg-003"})
  SET n3.status              = "CONFIRMED",
      n3.timestamp           = "2026-02-04T08:30:00Z",
      n3.negotiationDate     = "2026-02-04",
      n3.contractId          = "contract-pca-de-nl-003",
      n3.consumerDid         = "did:web:medreg.de:hdab",
      n3.providerDid         = "did:web:lmc.nl:clinic",
      n3.consumerCountry     = "DE",
      n3.providerCountry     = "NL",
      n3.crossBorder         = true,
      n3.policyId            = "policy:ehds-cross-border",
      n3.assetId             = "dataset:prostate-cancer-registry"
WITH n3
MATCH (consumer:Participant {participantId: "did:web:medreg.de:hdab"})
MATCH (provider:Participant {participantId: "did:web:lmc.nl:clinic"})
MATCH (asset:HealthDataset  {id: "dataset:prostate-cancer-registry"})
MERGE (n3)-[:NEGOTIATED_BY]->(consumer)
MERGE (n3)-[:OFFERED_BY]->(provider)
MERGE (n3)-[:FOR_ASSET]->(asset);

// NEG-004  TERMINATED  Institut de Recherche Santé → PharmaCo Research AG [policy mismatch, terminated]
MERGE (n4:ContractNegotiation {id: "neg-004"})
  SET n4.status              = "TERMINATED",
      n4.timestamp           = "2026-02-10T11:45:00Z",
      n4.negotiationDate     = "2026-02-10",
      n4.contractId          = NULL,
      n4.consumerDid         = "did:web:irs.fr:hdab",
      n4.providerDid         = "did:web:pharmaco.de:research",
      n4.consumerCountry     = "FR",
      n4.providerCountry     = "DE",
      n4.crossBorder         = true,
      n4.terminatedReason    = "Policy mismatch: usage purpose not permitted",
      n4.policyId            = "policy:ehds-research-use",
      n4.assetId             = "dataset:omop-cdm-v54-analytics"
WITH n4
MATCH (consumer:Participant {participantId: "did:web:irs.fr:hdab"})
MATCH (provider:Participant {participantId: "did:web:pharmaco.de:research"})
MATCH (asset:HealthDataset  {id: "dataset:omop-cdm-v54-analytics"})
MERGE (n4)-[:NEGOTIATED_BY]->(consumer)
MERGE (n4)-[:OFFERED_BY]->(provider)
MERGE (n4)-[:FOR_ASSET]->(asset);

// NEG-005  IN_PROGRESS  Limburg Medical Centre → AlphaKlinik Berlin (cross-border NL→DE)
MERGE (n5:ContractNegotiation {id: "neg-005"})
  SET n5.status              = "IN_PROGRESS",
      n5.timestamp           = "2026-03-05T10:00:00Z",
      n5.negotiationDate     = "2026-03-05",
      n5.contractId          = NULL,
      n5.consumerDid         = "did:web:lmc.nl:clinic",
      n5.providerDid         = "did:web:alpha-klinik.de:participant",
      n5.consumerCountry     = "NL",
      n5.providerCountry     = "DE",
      n5.crossBorder         = true,
      n5.policyId            = "policy:ehds-cross-border",
      n5.assetId             = "dataset:synthea-fhir-r4-mvd"
WITH n5
MATCH (consumer:Participant {participantId: "did:web:lmc.nl:clinic"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:synthea-fhir-r4-mvd"})
MERGE (n5)-[:NEGOTIATED_BY]->(consumer)
MERGE (n5)-[:OFFERED_BY]->(provider)
MERGE (n5)-[:FOR_ASSET]->(asset);

// ── 5. Data Transfers ─────────────────────────────────────────────────────────

// TRN-001  COMPLETED  PharmaCo Research AG ← AlphaKlinik Berlin  (T2D FHIR, first transfer)
MERGE (t1:DataTransfer {id: "trn-001"})
  SET t1.status              = "COMPLETED",
      t1.timestamp           = "2026-01-23T16:00:00Z",
      t1.transferDate        = "2026-01-23",
      t1.contractId          = "contract-fhir-t2d-001",
      t1.consumerDid         = "did:web:pharmaco.de:research",
      t1.providerDid         = "did:web:alpha-klinik.de:participant",
      t1.consumerCountry     = "DE",
      t1.providerCountry     = "DE",
      t1.crossBorder         = false,
      t1.protocol            = "HTTP-PUSH",
      t1.byteSize            = 14827392,
      t1.assetId             = "dataset:synthea-fhir-r4-mvd"
WITH t1
MATCH (consumer:Participant {participantId: "did:web:pharmaco.de:research"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:synthea-fhir-r4-mvd"})
MERGE (t1)-[:TRANSFERRED_BY]->(consumer)
MERGE (t1)-[:PROVIDED_BY]->(provider)
MERGE (t1)-[:TRANSFERS]->(asset);

// TRN-002  COMPLETED  PharmaCo Research AG ← AlphaKlinik Berlin (OMOP batch)
MERGE (t2:DataTransfer {id: "trn-002"})
  SET t2.status              = "COMPLETED",
      t2.timestamp           = "2026-01-29T09:45:00Z",
      t2.transferDate        = "2026-01-29",
      t2.contractId          = "contract-omop-analytics-002",
      t2.consumerDid         = "did:web:pharmaco.de:research",
      t2.providerDid         = "did:web:alpha-klinik.de:participant",
      t2.consumerCountry     = "DE",
      t2.providerCountry     = "DE",
      t2.crossBorder         = false,
      t2.protocol            = "HTTP-PULL",
      t2.byteSize            = 43102208,
      t2.assetId             = "dataset:omop-cdm-v54-analytics"
WITH t2
MATCH (consumer:Participant {participantId: "did:web:pharmaco.de:research"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:omop-cdm-v54-analytics"})
MERGE (t2)-[:TRANSFERRED_BY]->(consumer)
MERGE (t2)-[:PROVIDED_BY]->(provider)
MERGE (t2)-[:TRANSFERS]->(asset);

// TRN-003  COMPLETED  MedReg DE ← Limburg Medical Centre  (cross-border DE←NL)
MERGE (t3:DataTransfer {id: "trn-003"})
  SET t3.status              = "COMPLETED",
      t3.timestamp           = "2026-02-08T13:20:00Z",
      t3.transferDate        = "2026-02-08",
      t3.contractId          = "contract-pca-de-nl-003",
      t3.consumerDid         = "did:web:medreg.de:hdab",
      t3.providerDid         = "did:web:lmc.nl:clinic",
      t3.consumerCountry     = "DE",
      t3.providerCountry     = "NL",
      t3.crossBorder         = true,
      t3.protocol            = "HTTP-PUSH",
      t3.byteSize            = 9876543,
      t3.assetId             = "dataset:prostate-cancer-registry"
WITH t3
MATCH (consumer:Participant {participantId: "did:web:medreg.de:hdab"})
MATCH (provider:Participant {participantId: "did:web:lmc.nl:clinic"})
MATCH (asset:HealthDataset  {id: "dataset:prostate-cancer-registry"})
MERGE (t3)-[:TRANSFERRED_BY]->(consumer)
MERGE (t3)-[:PROVIDED_BY]->(provider)
MERGE (t3)-[:TRANSFERS]->(asset);

// TRN-004  IN_PROGRESS  Limburg Medical Centre ← AlphaKlinik Berlin (cross-border NL←DE, large batch)
MERGE (t4:DataTransfer {id: "trn-004"})
  SET t4.status              = "IN_PROGRESS",
      t4.timestamp           = "2026-03-10T08:00:00Z",
      t4.transferDate        = "2026-03-10",
      t4.contractId          = NULL,
      t4.consumerDid         = "did:web:lmc.nl:clinic",
      t4.providerDid         = "did:web:alpha-klinik.de:participant",
      t4.consumerCountry     = "NL",
      t4.providerCountry     = "DE",
      t4.crossBorder         = true,
      t4.protocol            = "HTTP-PULL",
      t4.byteSize            = NULL,
      t4.assetId             = "dataset:synthea-fhir-r4-mvd"
WITH t4
MATCH (consumer:Participant {participantId: "did:web:lmc.nl:clinic"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:synthea-fhir-r4-mvd"})
MERGE (t4)-[:TRANSFERRED_BY]->(consumer)
MERGE (t4)-[:PROVIDED_BY]->(provider)
MERGE (t4)-[:TRANSFERS]->(asset);

// TRN-005  ERROR  Institut de Recherche Santé → AlphaKlinik Berlin  (cross-border FR→DE, checksum mismatch)
MERGE (t5:DataTransfer {id: "trn-005"})
  SET t5.status              = "ERROR",
      t5.timestamp           = "2026-02-18T21:03:00Z",
      t5.transferDate        = "2026-02-18",
      t5.contractId          = NULL,
      t5.consumerDid         = "did:web:irs.fr:hdab",
      t5.providerDid         = "did:web:alpha-klinik.de:participant",
      t5.consumerCountry     = "FR",
      t5.providerCountry     = "DE",
      t5.crossBorder         = true,
      t5.protocol            = "HTTP-PUSH",
      t5.errorMessage        = "Data integrity check failed: SHA-256 mismatch",
      t5.byteSize            = 0,
      t5.assetId             = "dataset:synthea-fhir-r4-mvd"
WITH t5
MATCH (consumer:Participant {participantId: "did:web:irs.fr:hdab"})
MATCH (provider:Participant {participantId: "did:web:alpha-klinik.de:participant"})
MATCH (asset:HealthDataset  {id: "dataset:synthea-fhir-r4-mvd"})
MERGE (t5)-[:TRANSFERRED_BY]->(consumer)
MERGE (t5)-[:PROVIDED_BY]->(provider)
MERGE (t5)-[:TRANSFERS]->(asset);

// ── 6. Verify counts ──────────────────────────────────────────────────────────
MATCH (n:ContractNegotiation)
WITH count(n) AS neg_count
MATCH (t:DataTransfer)
RETURN neg_count, count(t) AS trn_count;
