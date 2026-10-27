// ==============================================================================
// MedReg ES, a second Health Data Access Body, for the cross-border story
//
// A data user who wants data held in more than one member state sends one
// application, and the access body that receives it forwards it to the others
// (EHDS Art. 67(3), over HealthData@EU, Art. 75). That coordination between
// access bodies is hard to show with only one of them on the graph. MedReg
// DE approving a permit looks like an approval workflow; MedReg DE and MedReg
// ES both appearing, each with its own national scope, looks like EHDS.
//
// Fictional, like every participant here (see .claude/rules/code-style.md).
// "MedReg ES" is deliberately the sibling of the already-fictional "MedReg DE"
// rather than a new invented name, so nobody has to check whether it collides
// with a real Spanish authority. It does not, because MedReg does not exist.
//
// Idempotent: MERGE only, safe to re-run.
// ==============================================================================

MERGE (es:Participant {participantId: 'did:web:medreg.es:hdab'})
  SET es.name         = 'MedReg ES',
      es.type         = 'HDAB_AUTHORITY',
      es.country      = 'ES',
      es.source       = coalesce(es.source, 'seed'),
      es.walletType   = 'business',
      // An access body publishes no catalogue: it approves access to other
      // people's. Same as MedReg DE and Institut de Recherche Santé.
      es.dspCatalogUrl   = null,
      es.crawlerEnabled  = false,
      es.onboardedAt  = coalesce(es.onboardedAt, datetime('2026-03-02T09:00:00Z'));

// Art. 67(3) coordination: the two access bodies recognise each other. The
// relationship is symmetric in meaning, so both directions are written rather
// than relying on readers to traverse it backwards.
MATCH (es:Participant {participantId: 'did:web:medreg.es:hdab'})
MATCH (de:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (es)-[c1:COORDINATES_WITH]->(de)
  SET c1.basis = 'Art. 67(3)', c1.since = date('2026-03-02')
MERGE (de)-[c2:COORDINATES_WITH]->(es)
  SET c2.basis = 'Art. 67(3)', c2.since = date('2026-03-02');

// A cross-border permit: a Spanish researcher's request over German-held data
// needs both bodies, which is the point of the article.
MATCH (es:Participant {participantId: 'did:web:medreg.es:hdab'})
MATCH (alpha:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MERGE (permit:HDABApproval {approvalId: 'permit-es-2026-014'})
  SET permit.status       = 'APPROVED',
      permit.ehdsArticle  = 'Art. 68',
      permit.purpose      = 'Cross-border cardiovascular outcomes study',
      permit.legalBasis   = 'Art. 67(3), Art. 68',
      permit.crossBorder  = true,
      permit.requestedOn  = date('2026-03-10'),
      permit.decidedOn    = date('2026-03-24'),
      permit.expiresOn    = date('2027-03-24')
MERGE (permit)-[:ISSUED_BY]->(es)
MERGE (permit)-[:COVERS_DATA_FROM]->(alpha);
