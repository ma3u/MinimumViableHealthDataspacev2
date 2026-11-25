// ==============================================================================
// Migration: an Observation's value is a number (#1218)
//
// scripts/load_fhir_neo4j.py stored valueQuantity.value as a string, '' when
// there was none (a blood pressure panel, whose values are its components).
// It now stores a number, and nothing when there is none, in `value` and in
// `valueQuantity` as the seeds name it. This file converts what it stored
// before: a numeric string becomes its number, an empty one goes. A string
// that is not a number is left and counted by the last statement, which
// neo4j/seed.sh requires to be zero.
//
// A panel loaded before keeps no components: they were never stored. Loading
// its bundle again with the current loader adds them.
//
// Idempotent: a second run finds no string value. The test is
// `IS :: STRING NOT NULL`: Cypher holds `NULL IS :: STRING` to be true.
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/migrate-observation-values.cypher
// ==============================================================================

MATCH (o:Observation)
WHERE o.value IS :: STRING NOT NULL AND trim(o.value) = ''
REMOVE o.value
RETURN count(o) AS emptyValuesRemoved;

MATCH (o:Observation)
WHERE o.value IS :: STRING NOT NULL AND toFloat(trim(o.value)) IS NOT NULL
WITH o, toFloat(trim(o.value)) AS v
SET o.value = v, o.valueQuantity = coalesce(o.valueQuantity, v)
RETURN count(o) AS valuesConverted;

RETURN COUNT { MATCH (o:Observation) WHERE o.value IS :: STRING NOT NULL } AS valuesNotNumbers;
