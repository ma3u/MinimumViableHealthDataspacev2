// ==============================================================================
// National implementation of the EHDS: DE, AT, BE, FR, NL, ES (#782, phase 1)
//
// Regulation (EU) 2025/327 is the same text in every member state. What
// differs is the legal role of the health data access body, the national law
// it acts under, how a person objects to secondary use, whether access is
// charged for, and the dates. That is a jurisdiction, not a translation.
//
// The laws and the legal roles are real and carry their official sources.
// The organisations on the hub stay fictional (.claude/rules/code-style.md):
// the real institution that holds a role is not named here, and the hub's
// participants are linked to their country's profile by their `country`.
//
// Checked against the sources on 2026-11-01 (reviewedOn). National
// implementation is moving: DE and NL have bills, FR and ES have announced
// theirs, BE and AT are preparing. No member state had designated its access
// body under Art. 55(6) on that date. A bill is marked BILL or DRAFT and
// described as one; nothing here says a bill is law.
//
// Runs after participant-source-init.cypher, which sets every participant's
// country. Idempotent: MERGE on the keys, SET of the content (this file is
// the source of the profiles, so a corrected fact should reach the graph).
// ==============================================================================

// ── 1. The profiles ──
UNWIND [
  {code: 'DE', sortOrder: 1, name: 'Germany', nameNative: 'Deutschland', languages: ['de'],
   accessBodyRole: 'Datenzugangs- und Koordinierungsstelle für Gesundheitsdaten (§ 3 GDNG); nach dem Entwurf des GeDIG die koordinierende Zugangsstelle für Gesundheitsdaten',
   accessBodyRoleEn: 'Health data access and coordination body (section 3 GDNG); under the GeDIG bill, the coordinating health data access body, with domain-specific access bodies beside it',
   designationStatus: 'Not designated under Art. 55 yet. The GeDIG bill makes the coordinating access body the Art. 55(1) body and coordinator and the Art. 75(1) national contact point; it is before the Bundestag.',
   optOutModel: 'Today: data from the electronic patient record (ePA) reach the research data centre unless the person objects (section 363 SGB V); the objection can be limited to purposes. Under the GeDIG bill: a central register for the rights of data subjects takes the objection under Art. 71, for all purposes or some, from age 15.',
   fees: 'Charged today: the research data centre charges under the Datentransparenz fee ordinance (DaTraGebV). Under the GeDIG bill the access bodies charge fees under Art. 62, set by ordinance of the health ministry.',
   summary: 'Germany has a health data use act since 2024 and a research data centre that takes applications. The bill that implements the EHDS (GeDIG) re-enacts that act, creates a coordinating access body and domain-specific ones, and a central register for objections.',
   sources: ['https://www.gesetze-im-internet.de/gdng/', 'https://www.gesetze-im-internet.de/gdng/__3.html', 'https://www.gesetze-im-internet.de/sgb_5/__363.html', 'https://www.gesetze-im-internet.de/datragebv/BJNR045800014.html', 'https://www.bundesgesundheitsministerium.de/service/gesetze-und-verordnungen/detail/gedig']},
  {code: 'AT', sortOrder: 2, name: 'Austria', nameNative: 'Österreich', languages: ['de'],
   accessBodyRole: 'Zugangsstelle für Gesundheitsdaten (noch nicht gesetzlich geregelt)',
   accessBodyRoleEn: 'Health data access body (not yet set out in law)',
   designationStatus: 'Not designated, and no implementation bill found. A national preparation project for secondary use (HealthData@AT) runs from 2023 to the end of 2027.',
   optOutModel: 'Today there is no objection specific to secondary use: the ELGA opt-out, general or partial, concerns the electronic health record and primary use. Research access to registers rests on the Research Organisation Act. The Art. 71 opt-out is still to be set out.',
   fees: 'Research access to statistical micro data through the micro data centre is charged at cost, per project and for use and storage. No fee rule under Art. 62 yet.',
   summary: 'Austria opens federal registers and statistical micro data for research under its Research Organisation Act and the Federal Statistics Act. The EHDS access body and its law are still being prepared.',
   sources: ['https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10009514&Paragraf=2d', 'https://www.elga.gv.at/teilnahme/elga-willenserklaerungen/', 'https://goeg.at/healthdata_at_secondary_use', 'https://www.statistik.at/fileadmin/pages/1805/Katalog_der_Serviceleistungen.pdf']},
  {code: 'BE', sortOrder: 3, name: 'Belgium', nameNative: 'België / Belgique / Belgien', languages: ['nl', 'fr', 'de'],
   accessBodyRole: 'coördinerende instantie voor toegang tot gezondheidsgegevens / organisme responsable de l\'accès aux données de santé (gepland / prévu)',
   accessBodyRoleEn: 'Coordinating health data access body (planned): the agency set up by the law of 14 March 2023, as an interfederal institution, with the information security committee granting permits',
   designationStatus: 'Not designated. The designation awaits political approval at inter-ministerial level; the law that will implement the EHDS follows once the governance is settled.',
   optOutModel: 'No general objection to secondary use in the current law; reuse is decided case by case by the information security committee under the GDPR. The Art. 71 opt-out is still to be set out.',
   fees: 'The law of 14 March 2023 (Art. 11) lets the agency charge applicants, the amount set by royal decree.',
   summary: 'Belgium created a health data agency by the law of 14 March 2023, to make health data findable and reusable. Its role as the coordinating EHDS access body is planned, across the federal state and the communities, in Dutch, French and German.',
   sources: ['https://www.ejustice.just.fgov.be/eli/wet/2023/03/14/2023041135/justel', 'https://www.hda.belgium.be/sites/default/files/documents/2024-05/GDA%20-%20Jaarverslag%202023.pdf']},
  {code: 'FR', sortOrder: 4, name: 'France', nameNative: 'France', languages: ['fr'],
   accessBodyRole: 'Plateforme des données de santé (art. L1462-1 du code de la santé publique)',
   accessBodyRoleEn: 'Health data platform, a public interest group created by the 2019 health system act (Public Health Code, Art. L1462-1)',
   designationStatus: 'Not designated. The EHDS is to be implemented through the bill adapting French law to EU law (DDADUE), which the Senate adopted on 18 February 2026 without an EHDS article yet; it is before the National Assembly.',
   optOutModel: 'Today a person can object to the reuse of their data from the national health data system (SNDS) for research, through the platform or their health insurance fund; the objection does not reach every processing of public bodies. How France will use the Art. 71(4) exception is not yet in a published text.',
   fees: 'Charged: the platform may charge for access, free in the cases the Public Health Code sets out, and harmonised fee grids were approved by the strategic committee for health data in February 2025.',
   summary: 'France has the national health data system (SNDS) and, since 2019, a health data platform that gives access to it for projects of public interest. The EHDS is to come in through the DDADUE bill.',
   sources: ['https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038886833', 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043715694', 'https://www.cnil.fr/fr/snds-systeme-national-des-donnees-de-sante', 'https://www.senat.fr/dossier-legislatif/pjl25-118.html', 'https://www.health-data-hub.fr/actualites/comite-strategique-des-donnees-de-sante-les-grilles-de-redevances-issues-du-groupe-de']},
  {code: 'NL', sortOrder: 5, name: 'Netherlands', nameNative: 'Nederland', languages: ['nl'],
   accessBodyRole: 'Gezondheidsdata-autoriteit (wetsvoorstel Wet op het gezondheidsinformatiestelsel)',
   accessBodyRoleEn: 'Health data authority, a new independent administrative body proposed by the Health Information System bill; it would be the Art. 55(1) access body, the Art. 75(1) contact point and the digital health authority of Art. 19',
   designationStatus: 'Not designated. The bill (first tranche) went to internet consultation from 27 May to 8 July 2026; the authority is to be operational by 26 March 2029.',
   optOutModel: 'Today data go to research without consent only under strict conditions and if the patient has not objected (Civil Code Art. 7:458). The Art. 71 opt-out and the permit procedure follow in the second tranche of the bill.',
   fees: 'Not set out yet; the first tranche of the bill does not cover fees.',
   summary: 'The Netherlands builds a new health data authority from scratch. The Health Information System bill sets it up in two tranches: the authority first, then the opt-out, the permits and the rules for secondary use.',
   sources: ['https://www.internetconsultatie.nl/ehds/document/15677', 'https://www.tweedekamer.nl/kamerstukken/brieven_regering/detail?id=2026Z10128&did=2026D22763', 'https://www.datavoorgezondheid.nl/actueel/nieuws/2026/06/09/internetconsultatie-wet-op-het-gezondheidsinformatiestelsel-gestart', 'https://wetten.overheid.nl/BWBR0005290']},
  {code: 'ES', sortOrder: 6, name: 'Spain', nameNative: 'España', languages: ['es'],
   accessBodyRole: 'organismo nacional de acceso a datos de salud, que coordina los organismos regionales de acceso a datos de salud (propuesto)',
   accessBodyRoleEn: 'National health data access body coordinating regional health data access bodies in the autonomous communities (proposed)',
   designationStatus: 'Not designated. The Digital Health Act that adapts Spanish law to the Regulation is a pre-draft; its prior public consultation ran from 22 September to 20 October 2025, and it was not yet approved by the Council of Ministers.',
   optOutModel: 'No general objection to secondary use today: health research rests on broad consent, compatible reuse after an ethics committee or pseudonymised data (Organic Law 3/2018, seventeenth additional provision); the GDPR right to object applies. The Art. 71 opt-out is still to be set out.',
   fees: 'No national fee schedule; the pre-draft is to set the fee regime.',
   summary: 'Spain plans a national access body that coordinates the regional ones, since health care is run by the autonomous communities. The Digital Health Act that implements the EHDS is in preparation.',
   sources: ['https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673', 'https://www.sanidad.gob.es/normativa/docs/2025.09.22_CPP_CPP_APL_Salud_Digital1_.pdf']}
] AS row
MERGE (j:Jurisdiction {code: row.code})
SET j.sortOrder = row.sortOrder,
    j.name = row.name,
    j.nameNative = row.nameNative,
    j.languages = row.languages,
    j.accessBodyRole = row.accessBodyRole,
    j.accessBodyRoleEn = row.accessBodyRoleEn,
    j.designationStatus = row.designationStatus,
    j.optOutModel = row.optOutModel,
    j.fees = row.fees,
    j.summary = row.summary,
    j.sources = row.sources,
    j.reviewedOn = '2026-11-01';

// ── 2. The national laws ──
UNWIND [
  {j: 'DE', id: 'de-gdng', title: 'Gesetz zur verbesserten Nutzung von Gesundheitsdaten (Gesundheitsdatennutzungsgesetz, GDNG)', titleEn: 'Health Data Use Act', citation: 'BGBl. 2024 I Nr. 102', year: 2024, url: 'https://www.gesetze-im-internet.de/gdng/', status: 'IN_FORCE'},
  {j: 'DE', id: 'de-sgb5-datentransparenz', title: 'Fünftes Buch Sozialgesetzbuch, §§ 303a bis 303f (Datentransparenz) und § 363', titleEn: 'Social Code Book V: data transparency and the research data centre; release of ePA data for research', citation: '§§ 303a-303f, § 363 SGB V', year: null, url: 'https://www.gesetze-im-internet.de/sgb_5/__303a.html', status: 'IN_FORCE'},
  {j: 'DE', id: 'de-datragebv', title: 'Datentransparenz-Gebührenverordnung (DaTraGebV)', titleEn: 'Data transparency fee ordinance', citation: null, year: null, url: 'https://www.gesetze-im-internet.de/datragebv/BJNR045800014.html', status: 'IN_FORCE'},
  {j: 'DE', id: 'de-gedig', title: 'Gesetz für Daten und digitale Innovation im Gesundheitswesen (GeDIG)', titleEn: 'Act on Data and Digital Innovation in Health Care (bill implementing the EHDS)', citation: 'BR-Drs. 448/26', year: 2026, url: 'https://www.bundesgesundheitsministerium.de/service/gesetze-und-verordnungen/detail/gedig', status: 'BILL'},
  {j: 'AT', id: 'at-fog', title: 'Forschungsorganisationsgesetz (FOG), § 2d', titleEn: 'Research Organisation Act: research access to federal registers', citation: 'BGBl. I Nr. 205/2021', year: 2021, url: 'https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10009514&Paragraf=2d', status: 'IN_FORCE'},
  {j: 'AT', id: 'at-bstatg', title: 'Bundesstatistikgesetz 2000, § 31', titleEn: 'Federal Statistics Act: research access to statistical micro data', citation: null, year: 2000, url: null, status: 'IN_FORCE'},
  {j: 'AT', id: 'at-gtelg', title: 'Gesundheitstelematikgesetz 2012 (GTelG 2012)', titleEn: 'Health Telematics Act: the electronic health record ELGA and its opt-out (primary use)', citation: null, year: 2012, url: null, status: 'IN_FORCE'},
  {j: 'BE', id: 'be-law-2023-03-14', title: 'Wet van 14 maart 2023 houdende oprichting en organisatie van het Gezondheids(zorg)data-agentschap / Loi du 14 mars 2023 relative à l\'institution et à l\'organisation de l\'Agence des données de (soins de) santé', titleEn: 'Law of 14 March 2023 establishing and organising the health (care) data agency', citation: 'M.B./B.S. 03.04.2023', year: 2023, url: 'https://www.ejustice.just.fgov.be/eli/wet/2023/03/14/2023041135/justel', status: 'IN_FORCE'},
  {j: 'FR', id: 'fr-loi-2019-774', title: 'Loi n° 2019-774 du 24 juillet 2019 relative à l\'organisation et à la transformation du système de santé, art. 41 (art. L1462-1 du code de la santé publique)', titleEn: 'Act on the organisation and transformation of the health system, Art. 41: the health data platform', citation: 'CSP art. L1462-1', year: 2019, url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038886833', status: 'IN_FORCE'},
  {j: 'FR', id: 'fr-decret-2021-848', title: 'Décret n° 2021-848 du 29 juin 2021 relatif au traitement de données à caractère personnel dénommé « système national des données de santé »', titleEn: 'Decree on the national health data system (SNDS)', citation: null, year: 2021, url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043715694', status: 'IN_FORCE'},
  {j: 'FR', id: 'fr-ddadue-2026', title: 'Projet de loi portant diverses dispositions d\'adaptation au droit de l\'Union européenne (DDADUE)', titleEn: 'Bill adapting French law to EU law, the announced vehicle for the EHDS', citation: 'Sénat n° 118 (2025-2026)', year: 2025, url: 'https://www.senat.fr/dossier-legislatif/pjl25-118.html', status: 'BILL'},
  {j: 'NL', id: 'nl-bw-7-458', title: 'Burgerlijk Wetboek Boek 7, artikel 458 (WGBO)', titleEn: 'Civil Code, medical treatment contract: research use without consent only if the patient has not objected', citation: 'art. 7:458 BW', year: null, url: 'https://wetten.overheid.nl/BWBR0005290', status: 'IN_FORCE'},
  {j: 'NL', id: 'nl-uavg', title: 'Uitvoeringswet Algemene verordening gegevensbescherming (UAVG)', titleEn: 'GDPR Implementation Act', citation: null, year: 2018, url: 'https://wetten.overheid.nl/BWBR0040940', status: 'IN_FORCE'},
  {j: 'NL', id: 'nl-wet-gis', title: 'Wet op het gezondheidsinformatiestelsel (Wet GIS), eerste tranche', titleEn: 'Health Information System Act, first tranche (bill implementing the EHDS)', citation: 'internetconsultatie 2026', year: 2026, url: 'https://www.internetconsultatie.nl/ehds/document/15677', status: 'DRAFT'},
  {j: 'ES', id: 'es-lopdgdd', title: 'Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales, disposición adicional decimoséptima', titleEn: 'Organic Law on data protection and digital rights, seventeenth additional provision: processing of health data', citation: 'BOE-A-2018-16673', year: 2018, url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673', status: 'IN_FORCE'},
  {j: 'ES', id: 'es-ley-14-2007', title: 'Ley 14/2007, de 3 de julio, de Investigación biomédica', titleEn: 'Biomedical Research Act', citation: 'BOE-A-2007-12945', year: 2007, url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-12945', status: 'IN_FORCE'},
  {j: 'ES', id: 'es-ley-41-2002', title: 'Ley 41/2002, de 14 de noviembre, básica reguladora de la autonomía del paciente', titleEn: 'Patient Autonomy Act', citation: 'BOE-A-2002-22188', year: 2002, url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2002-22188', status: 'IN_FORCE'},
  {j: 'ES', id: 'es-ley-salud-digital', title: 'Anteproyecto de Ley de Salud Digital, por el que se adapta al ordenamiento nacional el Reglamento (UE) 2025/327', titleEn: 'Digital Health Act, pre-draft adapting Spanish law to the EHDS', citation: null, year: 2025, url: 'https://www.sanidad.gob.es/normativa/docs/2025.09.22_CPP_CPP_APL_Salud_Digital1_.pdf', status: 'DRAFT'}
] AS row
MATCH (j:Jurisdiction {code: row.j})
MERGE (law:NationalLaw {lawId: row.id})
SET law.title = row.title,
    law.titleEn = row.titleEn,
    law.citation = row.citation,
    law.year = row.year,
    law.url = row.url,
    law.status = row.status
MERGE (j)-[:HAS_LEGAL_BASIS]->(law);

// ── 3. The dates of the Regulation, the same for every member state ──
// Art. 105: in force on the twentieth day after publication (5 March 2025);
// applies from 26 March 2027, Chapter IV (secondary use) from 26 March 2029,
// the categories of Art. 51(1)(b), (f), (g), (m) and (p) from 26 March 2031.
// Art. 55(6): the designated access bodies are notified by 26 March 2027.
UNWIND [
  {id: 'eu-2025-03-25-in-force', date: '2025-03-25', label: 'Regulation (EU) 2025/327 enters into force (Art. 105)', status: 'DONE'},
  {id: 'eu-2027-03-26-applies', date: '2027-03-26', label: 'The Regulation applies; each member state notifies its health data access bodies to the Commission (Art. 55(6))', status: 'PLANNED'},
  {id: 'eu-2029-03-26-secondary-use', date: '2029-03-26', label: 'Chapter IV, secondary use, applies: access applications, data permits, the Art. 71 opt-out (Art. 105)', status: 'PLANNED'},
  {id: 'eu-2031-03-26-categories', date: '2031-03-26', label: 'Secondary use extends to the categories of Art. 51(1)(b), (f), (g), (m) and (p), among them genetic data (Art. 105)', status: 'PLANNED'}
] AS row
MERGE (m:JurisdictionMilestone {milestoneId: row.id})
SET m.date = row.date, m.label = row.label, m.scope = 'EU', m.status = row.status
WITH m
MATCH (j:Jurisdiction)
MERGE (j)-[:HAS_MILESTONE]->(m);

// ── 4. The national dates ──
UNWIND [
  {j: 'DE', id: 'de-2024-03-26-gdng', date: '2024-03-26', label: 'The Health Data Use Act (GDNG) enters into force', status: 'DONE'},
  {j: 'DE', id: 'de-2026-07-15-gedig-cabinet', date: '2026-07-15', label: 'The federal cabinet adopts the GeDIG bill', status: 'DONE'},
  {j: 'DE', id: 'de-2026-10-08-gedig-bundestag', date: '2026-10-08', label: 'First reading of the GeDIG bill in the Bundestag', status: 'DONE'},
  {j: 'AT', id: 'at-2023-01-healthdata-at', date: '2023-01', label: 'The national preparation project for secondary use (HealthData@AT) starts', status: 'DONE'},
  {j: 'AT', id: 'at-2027-12-healthdata-at-ends', date: '2027-12', label: 'The preparation project ends', status: 'PLANNED'},
  {j: 'BE', id: 'be-2023-04-13-law', date: '2023-04-13', label: 'The law of 14 March 2023 on the health data agency enters into force', status: 'DONE'},
  {j: 'FR', id: 'fr-2019-07-24-loi', date: '2019-07-24', label: 'The health system act creates the health data platform (Art. 41)', status: 'DONE'},
  {j: 'FR', id: 'fr-2026-02-18-ddadue-senate', date: '2026-02-18', label: 'The Senate adopts the DDADUE bill, still without an EHDS article', status: 'DONE'},
  {j: 'NL', id: 'nl-2026-05-18-kamerbrief', date: '2026-05-18', label: 'Letter to Parliament on implementing the EHDS (Kamerstuk 27529-360)', status: 'DONE'},
  {j: 'NL', id: 'nl-2026-05-27-consultation', date: '2026-05-27', label: 'Internet consultation on the Health Information System bill opens (until 8 July 2026)', status: 'DONE'},
  {j: 'NL', id: 'nl-2029-03-26-authority', date: '2029-03-26', label: 'The health data authority is to be operational', status: 'PLANNED'},
  {j: 'ES', id: 'es-2025-09-22-consultation', date: '2025-09-22', label: 'Prior public consultation on the Digital Health Act opens (until 20 October 2025)', status: 'DONE'}
] AS row
MATCH (j:Jurisdiction {code: row.j})
MERGE (m:JurisdictionMilestone {milestoneId: row.id})
SET m.date = row.date, m.label = row.label, m.scope = 'NATIONAL', m.status = row.status
MERGE (j)-[:HAS_MILESTONE]->(m);

// ── 5. The hub's participants under their country's profile ──
// Fictional, every one (MedReg DE, MedReg ES, Institut de Recherche Santé,
// AlphaKlinik Berlin, Limburg Medical Centre, ...). A participant that moves
// country is moved here too.
MATCH (p:Participant)-[r:UNDER_JURISDICTION]->(j:Jurisdiction)
WHERE p.country IS NULL OR p.country <> j.code
DELETE r;

MATCH (p:Participant)
WHERE p.country IS NOT NULL
MATCH (j:Jurisdiction {code: p.country})
MERGE (p)-[:UNDER_JURISDICTION]->(j);
