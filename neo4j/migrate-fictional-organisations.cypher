// ==============================================================================
// Migration: real organisations in generated graph data to fictional ones
//
// scripts/generate-graph-seed.py used to write six real organisations as
// participants (a Finnish university hospital, a Swedish research institute,
// a Portuguese and a Polish hospital, the European Medicines Agency and ECDC)
// and seven datasets whose ids and titles named real agencies and programmes
// (ECDC, WHO, EMA, NHS, EuroTransplant, ERDERA, 1+Million Genomes). The
// project allows real organisation names only behind NEXT_PUBLIC_DEMO_TK
// (.claude/rules/code-style.md). The generator now writes fictional ones;
// this file renames what an earlier run left in a graph.
//
// It renames in place, so every relationship stays: PUBLISHED_BY, GOVERNS,
// OFFERS, the patients' dataset links, negotiations and transfers. Where the
// fictional node already exists too (the new generator ran before this file),
// the old node is a leftover copy and is removed instead.
//
// Run it against a graph the generator once loaded, then the translations,
// which set the German, Spanish, French and Dutch titles by the new ids:
//
//   for f in migrate-fictional-organisations seed-catalog-translations; do
//     docker exec -i health-dataspace-neo4j \
//       cypher-shell -u neo4j -p healthdataspace < "neo4j/$f.cypher"
//   done
//
// neo4j/seed.sh runs it before register-healthdcat-ap-r8.cypher. Idempotent:
// every statement matches only the old ids, so a second run changes nothing,
// and a graph the generator never loaded is left as it is.
// ==============================================================================

// ── 1. Participants ─────────────────────────────────────────────────────────
UNWIND [
  {old: 'did:web:hus.fi:clinic',           new: 'did:web:betaklinik.fi:clinic',  name: 'BetaKlinik Helsinki'},
  {old: 'did:web:ki.se:research',          new: 'did:web:omegalab.se:research',  name: 'OmegaLab Research AB'},
  {old: 'did:web:chlisboa.pt:clinic',      new: 'did:web:gammaklinik.pt:clinic', name: 'GammaKlinik Lisboa'},
  {old: 'did:web:pcz.pl:clinic',           new: 'did:web:deltaklinik.pl:clinic', name: 'DeltaKlinik Warszawa'},
  {old: 'did:web:ema.europa.eu:authority', new: 'did:web:medreg.eu:authority',   name: 'MedReg EU'},
  {old: 'did:web:ecdc.europa.eu:hdab',     new: 'did:web:medreg.se:hdab',        name: 'MedReg SE'}
] AS m
MATCH (old:Participant {participantId: m.old})
OPTIONAL MATCH (fictional:Participant {participantId: m.new})
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [1] ELSE [] END |
  SET old.participantId = m.new, old.name = m.name)
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [] ELSE [1] END |
  DETACH DELETE old);

// ── 2. Their credentials: the id is md5(<did>-<type>) in the generator ──────
UNWIND [
  {old: 'vc-b806902b4ef6', new: 'vc-286eb9eeb33a', did: 'did:web:betaklinik.fi:clinic'},
  {old: 'vc-73955a2a7d2c', new: 'vc-2219a7f9be53', did: 'did:web:betaklinik.fi:clinic'},
  {old: 'vc-1066ab2ce30f', new: 'vc-831eb974af8b', did: 'did:web:omegalab.se:research'},
  {old: 'vc-7b58f75f0868', new: 'vc-822707ed046e', did: 'did:web:omegalab.se:research'},
  {old: 'vc-b6b5592e755d', new: 'vc-79a38161778b', did: 'did:web:gammaklinik.pt:clinic'},
  {old: 'vc-8c6e416aa87f', new: 'vc-4a0877531c78', did: 'did:web:gammaklinik.pt:clinic'},
  {old: 'vc-55003c543cd9', new: 'vc-d2f03e81e704', did: 'did:web:deltaklinik.pl:clinic'},
  {old: 'vc-e45f352da99d', new: 'vc-cb48e2894a35', did: 'did:web:deltaklinik.pl:clinic'},
  {old: 'vc-1493ac3fa565', new: 'vc-b8b74766d1d3', did: 'did:web:medreg.eu:authority'},
  {old: 'vc-b2bd35cac7d9', new: 'vc-e2d0bde09575', did: 'did:web:medreg.eu:authority'},
  {old: 'vc-bcad993fd9c4', new: 'vc-6f94426bfdf6', did: 'did:web:medreg.se:hdab'},
  {old: 'vc-5e3d548a975d', new: 'vc-16697a57f00f', did: 'did:web:medreg.se:hdab'}
] AS m
MATCH (old:VerifiableCredential {credentialId: m.old})
OPTIONAL MATCH (fictional:VerifiableCredential {credentialId: m.new})
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [1] ELSE [] END |
  SET old.credentialId = m.new, old.subjectDid = m.did)
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [] ELSE [1] END |
  DETACH DELETE old);

// ── 3. The contact points register-healthdcat-ap-r8.cypher made from names ──
UNWIND [
  {old: 'contact:helsinki-university-hospital', new: 'contact:betaklinik-helsinki',  name: 'BetaKlinik Helsinki'},
  {old: 'contact:centro-hospitalar-lisboa',     new: 'contact:gammaklinik-lisboa',   name: 'GammaKlinik Lisboa'},
  {old: 'contact:polskie-centrum-zdrowia',      new: 'contact:deltaklinik-warszawa', name: 'DeltaKlinik Warszawa'}
] AS m
MATCH (old:ContactPoint {contactId: m.old})
OPTIONAL MATCH (fictional:ContactPoint {contactId: m.new})
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [1] ELSE [] END |
  SET old.contactId = m.new,
      old.name = m.name + ' data access desk',
      old.email = 'data-access@' + substring(m.new, 8) + '.example')
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [] ELSE [1] END |
  DETACH DELETE old);

// ── 4. Datasets, with their distribution and data product ───────────────────
// The generator derives dist:<slug> and product-<slug> from dataset:<slug>.
UNWIND [
  {old: 'rare-disease-erdera-2026',  new: 'rare-disease-compendium-2026',
   title: 'EU Rare Disease Compendium',
   description: 'Rare disease phenotype data from European reference centres.'},
  {old: 'antimicrobial-resist-ecdc', new: 'antimicrobial-resist-eu-2025',
   title: 'EU Antimicrobial Resistance 2025',
   description: 'EU-wide AMR surveillance data, FHIR export.'},
  {old: 'maternal-health-who-afro',  new: 'maternal-health-africa',
   title: 'African Maternal Health Dataset',
   description: 'Maternal-neonatal outcomes from 12 African countries.'},
  {old: 'organ-transplant-eurotx',   new: 'organ-transplant-eu',
   title: 'European Organ Allocation Dataset',
   description: 'Post-transplant outcome data across 8 countries.'},
  {old: 'pharmacovigilance-ema',     new: 'pharmacovigilance-eu',
   title: 'EU Pharmacovigilance Signal Data',
   description: 'Adverse drug reaction signal data from case safety reports.'},
  {old: 'genomics-1m-genomes',       new: 'genomics-reference-cohort',
   title: 'Genomic Reference Cohort',
   description: 'Genomic variants + phenotype, European reference cohort.'},
  {old: 'dental-health-who-euro',    new: 'dental-health-eu-2025',
   title: 'European Oral Health Survey 2025',
   description: 'Oral health examination data from 20 European countries.'}
] AS m
MATCH (old:HealthDataset {datasetId: 'dataset:' + m.old})
OPTIONAL MATCH (fictional:HealthDataset {datasetId: 'dataset:' + m.new})
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [1] ELSE [] END |
  SET old.datasetId = 'dataset:' + m.new,
      old.title = m.title,
      old.description = m.description)
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [] ELSE [1] END |
  DETACH DELETE old);

UNWIND [
  {old: 'rare-disease-erdera-2026',  new: 'rare-disease-compendium-2026'},
  {old: 'antimicrobial-resist-ecdc', new: 'antimicrobial-resist-eu-2025'},
  {old: 'maternal-health-who-afro',  new: 'maternal-health-africa'},
  {old: 'organ-transplant-eurotx',   new: 'organ-transplant-eu'},
  {old: 'pharmacovigilance-ema',     new: 'pharmacovigilance-eu'},
  {old: 'genomics-1m-genomes',       new: 'genomics-reference-cohort'},
  {old: 'dental-health-who-euro',    new: 'dental-health-eu-2025'}
] AS m
MATCH (old:Distribution {distributionId: 'dist:' + m.old})
OPTIONAL MATCH (fictional:Distribution {distributionId: 'dist:' + m.new})
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [1] ELSE [] END |
  SET old.distributionId = 'dist:' + m.new)
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [] ELSE [1] END |
  DETACH DELETE old);

UNWIND [
  {old: 'rare-disease-erdera-2026',  new: 'rare-disease-compendium-2026'},
  {old: 'antimicrobial-resist-ecdc', new: 'antimicrobial-resist-eu-2025'},
  {old: 'maternal-health-who-afro',  new: 'maternal-health-africa'},
  {old: 'organ-transplant-eurotx',   new: 'organ-transplant-eu'},
  {old: 'pharmacovigilance-ema',     new: 'pharmacovigilance-eu'},
  {old: 'genomics-1m-genomes',       new: 'genomics-reference-cohort'},
  {old: 'dental-health-who-euro',    new: 'dental-health-eu-2025'}
] AS m
MATCH (old:DataProduct {productId: 'product-' + m.old})
OPTIONAL MATCH (fictional:DataProduct {productId: 'product-' + m.new})
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [1] ELSE [] END |
  SET old.productId = 'product-' + m.new)
FOREACH (_ IN CASE WHEN fictional IS NULL THEN [] ELSE [1] END |
  DETACH DELETE old);

// ── 5. Names the generator built from the old titles and descriptions ───────
// Two datasets kept their ids and lost a real programme from the description.
MATCH (d:HealthDataset {datasetId: 'dataset:cardiac-outcomes-eu-2025'})
WHERE d.description CONTAINS 'EuroHeart'
SET d.description = 'Federated cardiac events registry, EHDS pilot.';

MATCH (d:HealthDataset {datasetId: 'dataset:lung-cancer-screening-nl'})
WHERE d.description CONTAINS 'NELSON'
SET d.description = 'Low-dose CT screening cohort with follow-up, FHIR R4.';

MATCH (d:HealthDataset {datasetId: 'dataset:diabetes-retinopathy-uk'})
WHERE d.description CONTAINS 'NHS'
SET d.description = 'Retinal image + FHIR Observation data from national screening.';

// The distribution, product, negotiation and transfer of every renamed dataset
// carry its title.
UNWIND ['rare-disease-compendium-2026', 'antimicrobial-resist-eu-2025',
        'maternal-health-africa', 'organ-transplant-eu', 'pharmacovigilance-eu',
        'genomics-reference-cohort', 'dental-health-eu-2025'] AS slug
MATCH (d:HealthDataset {datasetId: 'dataset:' + slug})
OPTIONAL MATCH (d)-[:HAS_DISTRIBUTION]->(dist:Distribution {distributionId: 'dist:' + slug})
OPTIONAL MATCH (dp:DataProduct {productId: 'product-' + slug})-[:DESCRIBED_BY]->(d)
FOREACH (x IN CASE WHEN dist IS NULL THEN [] ELSE [dist] END |
  SET x.title = d.title + ' (FHIR R4 Bundle)')
FOREACH (x IN CASE WHEN dp IS NULL THEN [] ELSE [dp] END |
  SET x.name = d.title + ' Product');

UNWIND ['rare-disease-compendium-2026', 'antimicrobial-resist-eu-2025',
        'maternal-health-africa', 'organ-transplant-eu', 'pharmacovigilance-eu',
        'genomics-reference-cohort', 'dental-health-eu-2025'] AS slug
MATCH (d:HealthDataset {datasetId: 'dataset:' + slug})
MATCH (cn:ContractNegotiation)-[:FOR_ASSET]->(d)
WHERE cn.negotiationId STARTS WITH 'neg-extra-'
SET cn.name = 'Negotiation: ' + d.title;

UNWIND ['rare-disease-compendium-2026', 'antimicrobial-resist-eu-2025',
        'maternal-health-africa', 'organ-transplant-eu', 'pharmacovigilance-eu',
        'genomics-reference-cohort', 'dental-health-eu-2025'] AS slug
MATCH (d:HealthDataset {datasetId: 'dataset:' + slug})
MATCH (dt:DataTransfer)-[:TRANSFERS]->(d)
WHERE dt.transferId STARTS WITH 'xfer-extra-'
SET dt.name = 'Transfer: ' + d.title;
