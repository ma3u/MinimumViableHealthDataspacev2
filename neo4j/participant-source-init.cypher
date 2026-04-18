// ==============================================================================
// Phase 26a: Dynamic participant directory — source + walletType + crawl targets
//
// Augments the :Participant nodes created by insert-synthetic-schema-data.cypher
// with fields the catalog crawler reads to discover DSP catalogs across the
// dataspace. Idempotent — safe to re-run.
//
// source     : 'seed' | 'dcp' | 'business-wallet' | 'private-wallet'
// walletType : 'business' | 'private'
// country    : ISO-3166-1 alpha-2
// dspCatalogUrl : publisher's DSP /catalog endpoint (null = not crawlable)
// crawlerEnabled: boolean — set false to temporarily skip without deletion
// onboardedAt   : ISO8601 datetime (used by UI to show "joined" age)
// ==============================================================================

// AlphaKlinik Berlin — DATA_HOLDER, business wallet, DE
MERGE (alpha:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
  SET alpha.source        = coalesce(alpha.source, 'seed'),
      alpha.walletType    = 'business',
      alpha.country       = 'DE',
      alpha.dspCatalogUrl = 'https://dsp.alpha-klinik.de/catalog',
      alpha.crawlerEnabled = true,
      alpha.onboardedAt   = coalesce(alpha.onboardedAt, datetime('2026-01-15T09:00:00Z'));

// PharmaCo Research AG — DATA_USER, business wallet, DE
MERGE (pharmaco:Participant {participantId: 'did:web:pharmaco.de:research'})
  SET pharmaco.source        = coalesce(pharmaco.source, 'seed'),
      pharmaco.walletType    = 'business',
      pharmaco.country       = 'DE',
      pharmaco.dspCatalogUrl = 'https://dsp.pharmaco.de/catalog',
      pharmaco.crawlerEnabled = true,
      pharmaco.onboardedAt   = coalesce(pharmaco.onboardedAt, datetime('2026-02-01T09:00:00Z'));

// MedReg DE — HDAB_AUTHORITY, business wallet, DE
MERGE (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})
  SET medreg.source        = coalesce(medreg.source, 'seed'),
      medreg.walletType    = 'business',
      medreg.country       = 'DE',
      medreg.dspCatalogUrl = null,
      medreg.crawlerEnabled = false,
      medreg.onboardedAt   = coalesce(medreg.onboardedAt, datetime('2026-01-10T09:00:00Z'));

// Limburg Medical Centre — DATA_HOLDER, business wallet, NL
MERGE (lmc:Participant {participantId: 'did:web:lmc.nl:clinic'})
  SET lmc.source        = coalesce(lmc.source, 'seed'),
      lmc.walletType    = 'business',
      lmc.country       = 'NL',
      lmc.dspCatalogUrl = 'https://dsp.lmc.nl/catalog',
      lmc.crawlerEnabled = true,
      lmc.onboardedAt   = coalesce(lmc.onboardedAt, datetime('2026-01-20T09:00:00Z'));

// Institut de Recherche Santé — HDAB/DATA_USER, business wallet, FR
MERGE (irs:Participant {participantId: 'did:web:irs.fr:hdab'})
  SET irs.source        = coalesce(irs.source, 'seed'),
      irs.walletType    = 'business',
      irs.country       = 'FR',
      irs.dspCatalogUrl = 'https://dsp.irs.fr/catalog',
      irs.crawlerEnabled = true,
      irs.onboardedAt   = coalesce(irs.onboardedAt, datetime('2026-02-14T09:00:00Z'));

// Indexes that speed up the crawler's MATCH
CREATE INDEX participant_source_idx IF NOT EXISTS FOR (p:Participant) ON (p.source);
CREATE INDEX participant_wallet_idx IF NOT EXISTS FOR (p:Participant) ON (p.walletType);
CREATE INDEX participant_country_idx IF NOT EXISTS FOR (p:Participant) ON (p.country);
