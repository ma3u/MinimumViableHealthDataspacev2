// ==============================================================================
// Migration: EHDS article labels to the adopted numbering, one format (#694)
//
// The seeds wrote `ehdsArticle` on credential and approval nodes in three
// formats ('Article 46', 'EHDS Art. 46', 'EHDS_Art_53') and with the 2022
// proposal's numbers. Regulation (EU) 2025/327 renumbered the articles (see
// docs/ehds-article-numbering.md). The seeds now write "Art. NN" with the
// adopted number; this file corrects a graph that was seeded before.
//
// Run it once against a live graph, after the seeds:
//
//   cat neo4j/migrate-ehds-article-labels.cypher | \
//     docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace
//
// On Azure, neo4j/seed.sh runs it after the other seeds. Idempotent: every
// statement matches only the old value, so a second run changes nothing.
// One statement per mapping, so the cypher-shell output shows what each did.
// ==============================================================================

// ── EHDSParticipantCredential: the article of the participant's role ───────

// Proposal Art. 36, health data access bodies -> adopted Art. 55.
MATCH (vc:VerifiableCredential) WHERE vc.ehdsArticle IN ['Article 36', 'EHDS Art. 36']
SET vc.ehdsArticle = 'Art. 55';

// Data holder: proposal Art. 49 (access from a single data holder) was the
// wrong article for the role; the duties of health data holders are adopted
// Art. 60 (proposal Art. 41).
MATCH (vc:VerifiableCredential) WHERE vc.ehdsArticle IN ['Article 49', 'EHDS Art. 49']
SET vc.ehdsArticle = 'Art. 60';

// Data user: proposal Art. 46 is the data permit (adopted Art. 68), which a
// participant credential is not; the duties of health data users are adopted
// Art. 61, which has no proposal counterpart.
MATCH (vc:VerifiableCredential) WHERE vc.ehdsArticle IN ['Article 46', 'EHDS Art. 46']
SET vc.ehdsArticle = 'Art. 61';

// DataProcessingPurposeCredential: the purposes of secondary use are adopted
// Art. 53 (proposal Art. 34). Only the format changes.
MATCH (vc:VerifiableCredential) WHERE vc.ehdsArticle IN ['Article 53', 'EHDS Art. 53', 'EHDS_Art_53']
SET vc.ehdsArticle = 'Art. 53';

// ── HDABApproval: an approval is a data permit, adopted Art. 68 ─────────────

// Proposal Art. 46, data permit -> adopted Art. 68.
MATCH (a:HDABApproval) WHERE a.ehdsArticle IN ['EHDS Art. 46', 'Article 46', 'Art. 46']
SET a.ehdsArticle = 'Art. 68';

// The LMC cross-border permit was labelled "EHDS Art. 51" for mutual
// recognition; adopted Art. 51 is minimum data categories. It is a permit
// (Art. 68) granted on one application across member states (Art. 67(3)).
MATCH (a:HDABApproval) WHERE a.ehdsArticle IN ['EHDS Art. 51', 'Article 51']
SET a.ehdsArticle = 'Art. 68';

// The DSP marketplace approval carried the purpose article in a third format.
MATCH (a:HDABApproval) WHERE a.ehdsArticle IN ['EHDS_Art_53', 'EHDS Art. 53', 'Article 53']
SET a.ehdsArticle = 'Art. 68';

// Already the adopted number; only the "EHDS " prefix goes.
MATCH (a:HDABApproval) WHERE a.ehdsArticle = 'EHDS Art. 68'
SET a.ehdsArticle = 'Art. 68';

// ── AccessApplication: already adopted Art. 67; only the prefix goes ────────

MATCH (app:AccessApplication) WHERE app.ehdsArticle = 'EHDS Art. 67'
SET app.ehdsArticle = 'Art. 67';

// ── Relationships carrying an article ───────────────────────────────────────

// Trust centres recognising each other: there is no such article in the
// adopted text; the closest provision is HealthData@EU, Art. 75.
MATCH (:TrustCenter)-[r:MUTUALLY_RECOGNISES]->(:TrustCenter)
WHERE r.framework IN ['EHDS Art. 51', 'Art. 51']
SET r.framework = 'Art. 75';

// Coordination between access bodies was labelled "EHDS Art. 14" (adopted
// Art. 14 is priority data categories). One application forwarded to the
// other access bodies is Art. 67(3).
MATCH (:Participant)-[c:COORDINATES_WITH]->(:Participant)
WHERE c.basis IN ['EHDS Art. 14', 'Art. 14']
SET c.basis = 'Art. 67(3)';

// ── Report: anything still in an old format shows up here ────────────────────

MATCH (n)
WHERE (n:VerifiableCredential OR n:HDABApproval OR n:AccessApplication)
  AND n.ehdsArticle IS NOT NULL
  AND (n.ehdsArticle STARTS WITH 'Article ' OR n.ehdsArticle STARTS WITH 'EHDS')
RETURN labels(n)[0] AS label, n.ehdsArticle AS leftInOldFormat, count(*) AS nodes
ORDER BY label;
