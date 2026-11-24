// =============================================================================
// Every HealthDataset names its publisher through PUBLISHED_BY (#514)
// =============================================================================
// Both catalogues read a dataset's publisher through PUBLISHED_BY: the UI's
// /api/catalog matches (:Participant), the proxy's HealthDCAT-AP output takes
// the target whatever its label. The target is the Participant, the dataspace
// member that offers the dataset (DSP).
//
// The HealthDCAT-AP registration seeds (register-fhir-dataset-hdcatap*.cypher)
// give their dataset an (:Organization)-[:OWNS_DATASET]-> owner and no
// PUBLISHED_BY, so the SPE-2 dataset showed no publisher in either output.
// The Organization carries the DID of the Participant it stands for in
// participantDid; this links the dataset to that Participant.
//
// Idempotent: MERGE only, and a dataset that already has a Participant
// publisher is left alone. seed.sh then fails if any HealthDataset is still
// without one (check_dataset_publishers).
// =============================================================================

MATCH (o:Organization)-[:OWNS_DATASET]->(d:HealthDataset)
WHERE o.participantDid IS NOT NULL
  AND NOT EXISTS { MATCH (d)-[:PUBLISHED_BY]->(:Participant) }
MATCH (p:Participant {participantId: o.participantDid})
MERGE (d)-[:PUBLISHED_BY]->(p);
