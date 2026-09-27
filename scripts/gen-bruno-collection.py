#!/usr/bin/env python3
"""Generator for bruno/MVHDv2 (#348, #349, ADR-032).

The collection is organised by EHDS persona: each folder is one role in
Regulation (EU) 2025/327 and holds the requests that role sends, in the order
its journey runs. Two folders hold the cross-persona procedures the regulation
defines (the data permit under Art. 67 to 73, the data request under Art. 69),
one holds the role boundaries, and three hold the technical surfaces a
connecting partner and the platform team use.

This wrote the collection once. The .bru files are the source of truth from
here on: adding a request means adding a file, not editing this script, and
scripts/check-bruno-coverage.py is what keeps the collection and the routes
aligned. It is kept because it documents, in one place, the shape every request
follows and why each folder exists; re-running it overwrites the collection.

Run: python3 scripts/gen-bruno-collection.py <repo root>
"""
import json, os, re, shutil, sys

ROOT = sys.argv[1]
OUT = os.path.join(ROOT, "bruno", "MVHDv2")

# persona -> environment variable holding that persona's forged session cookie
P = {
    "admin": "sessionToken",                 # EDC_ADMIN
    "regulator": "sessionTokenRegulator",    # HDAB_AUTHORITY
    "researcher": "sessionTokenResearcher",  # DATA_USER
    "patient": "sessionTokenPatient",        # PATIENT
    "clinic": "sessionTokenClinic",          # DATA_HOLDER
    "anon": None,                            # bogus cookie: the server sees no session
}

FOLDERS, REQS = [], []

def folder(dirname, title, docs=""):
    FOLDERS.append((dirname, title, docs))
    return dirname

def req(folder, name, method, url, *, body=None, form=None, persona="admin",
        bearer=None, asserts=(), tests="", docs="", mock=False, headers=None, pre=""):
    REQS.append(dict(folder=folder, name=name, method=method, url=url, body=body,
                     form=form, persona=persona, bearer=bearer, asserts=list(asserts),
                     tests=tests.strip("\n"), docs=docs.strip("\n"), mock=mock,
                     pre=pre.strip("\n"), headers=headers or {}))

B = "{{baseUrl}}"

# ===========================================================================
f = folder("00 Public", "Anyone, without signing in",
"""What Regulation (EU) 2025/327 requires an access body to publish, and what the
platform exposes before any login: the Art. 56 information duty, the Art. 73
registers of permits and results, and the yearly activity report. A partner can
send every request in this folder before an account exists.""")
req(f, "01 Is the hub up", "get", f"{B}/api/health", persona="anon",
    asserts=["res.status: eq 200", "res.body: isJson"],
    docs="Liveness of the integration hub. No session needed.")
req(f, "02 Public information (Art. 56)", "get", f"{B}/api/information", persona="anon", mock=True,
    asserts=["res.status: eq 200", "res.body.article: isDefined", "res.body.bodies: isArray",
             "res.body.access: isArray", "res.body.optOut: isDefined", "res.body.fees: isDefined"],
    docs="Access bodies, access conditions, results, the Art. 71(2) opt-out, retention and fees.")
req(f, "03 Register of data permits (Art. 73)", "get", f"{B}/api/permits", persona="anon", mock=True,
    asserts=["res.status: eq 200", "res.body.entries: isArray", "res.body.articles: isDefined"],
    docs="Every permit the access body issued, with its purpose, its dataset and its conditions.")
req(f, "04 Register of results (Art. 70)", "get", f"{B}/api/compliance/results", persona="anon", mock=True,
    asserts=["res.status: eq 200", "res.body.results: isArray"],
    docs="What data users published from the data they were permitted.")
req(f, "05 Activity report (Art. 73)", "get", f"{B}/api/activity-report", persona="anon", mock=True,
    asserts=["res.status: eq 200", "res.body.article: isDefined", "res.body.accessBodies: isArray",
             "res.body.items: isDefined"])
req(f, "06 Where to sign in", "get", f"{B}/api/keycloak-config", persona="anon",
    asserts=["res.status: eq 200", "res.body.clientId: eq health-dataspace-ui", "res.body.publicUrl: isDefined"],
    docs="The OIDC issuer and client id a partner's own client needs.")

# ===========================================================================
f = folder("01 Patient", "A patient: Maria Garcia (PATIENT)",
"""Chapter II, primary use. What a natural person may see and decide about their own
electronic health data: the record itself (Art. 3), a copy in an interoperable format,
insights drawn from it, and control over whether it is used for research (Art. 10 consent,
GDPR Art. 7(3) withdrawal). The consent granted here is withdrawn two requests later, so
the folder leaves no state behind.""")
req(f, "01 My record (Art. 3)", "get", f"{B}/api/patient/profile?patientId={{{{patientId}}}}", persona="patient",
    asserts=["res.status: eq 200", "res.body.patient: isDefined", "res.body.conditions: isArray",
             "res.body.medications: isArray", "res.body.gdprRights: isDefined"],
    docs="The FHIR R4 summary of one patient: conditions, medications, observations, and the GDPR rights that apply.")
req(f, "02 My observations as a FHIR Bundle", "get", f"{B}/api/patient/observations?patientId={{{{patientId}}}}",
    persona="patient", mock=True,
    asserts=["res.status: eq 200", "res.body.resourceType: eq Bundle", "res.body.entry: isArray"],
    docs="Art. 3(2): the data in an interoperable format. This is the payload a patient app receives.")
req(f, "03 What my data tells me", "get", f"{B}/api/patient/insights?patientId={{{{patientId}}}}",
    persona="patient", mock=True,
    asserts=["res.status: eq 200", "res.body.patientId: eq {{patientId}}", "res.body.findings: isArray",
             "res.body.ehdsArticles: isDefined"])
req(f, "04 My view of the dataspace", "get", f"{B}/api/overview", persona="patient",
    asserts=["res.status: eq 200", "res.body.persona: eq patient", "res.body.layers: isDefined"])
req(f, "05 Research programmes asking for my data", "get", f"{B}/api/patient/research?patientId={{{{patientId}}}}",
    persona="patient", mock=True,
    asserts=["res.status: eq 200", "res.body.programs: isArray", "res.body.consents: isArray",
             "res.body.ehdsArticle: isDefined"],
    tests="""
test("captures a programme I could consent to", function () {
  const programs = res.getBody().programs || [];
  expect(programs.length, "no research programme is offered; seed the graph first").to.be.above(0);
  bru.setVar("studyId", programs[0].studyId);
  bru.setVar("studyName", programs[0].studyName || "");
});
""",
    docs="The study id comes from this list, not from the environment: a consent for an id no programme carries is silently not written (see request 11).")
req(f, "06 I consent to one programme (Art. 10)", "post", f"{B}/api/patient/research", persona="patient",
    body={"patientId": "{{patientId}}", "studyId": "{{studyId}}", "purpose": "RESEARCH"},
    asserts=["res.status: eq 200", "res.body.patientId: eq {{patientId}}", "res.body.studyId: eq {{studyId}}",
             "res.body.grantedAt: isDefined"])
req(f, "07 My consent is on record", "get", f"{B}/api/patient/research?patientId={{{{patientId}}}}", persona="patient",
    asserts=["res.status: eq 200", "res.body.consents: isArray"],
    tests="""
test("the consent just granted appears in my list", function () {
  const consents = res.getBody().consents || [];
  const studyId = bru.getVar("studyId") || bru.getEnvVar("studyId");
  const mine = consents.find((c) => (c.studyId || c.study) === studyId);
  expect(mine, "the consent granted in the previous request is not in the list").to.not.equal(undefined);
  bru.setVar("consentId", mine.consentId || mine.id);
});
""")
req(f, "08 I withdraw it (GDPR Art. 7(3))", "delete",
    f"{B}/api/patient/research?patientId={{{{patientId}}}}&consentId={{{{consentId}}}}", persona="patient",
    asserts=["res.status: eq 200"])
req(f, "09 Pull my record from the national system", "post", f"{B}/api/patient/ehr-sync", persona="patient",
    asserts=["res.status: eq 200", "res.body.patientId: eq {{patientId}}", "res.body.lastEhrSync: isDefined"],
    docs="Art. 3(5): the record is fetched from the national access service (here a German ePA transfer, GesundheitsID-authenticated).")
req(f, "10 Consent without a study (400)", "post", f"{B}/api/patient/research", persona="patient", body={},
    asserts=["res.status: eq 400", "res.body.error: contains patientId"])
req(f, "11 Consent to a programme that does not exist", "post", f"{B}/api/patient/research", persona="patient",
    body={"patientId": "{{patientId}}", "studyId": "study-does-not-exist", "purpose": "RESEARCH"},
    tests="""
// Known red, #349. The route MATCHes the DataProduct and MERGEs the consent
// inside that match, so an unknown study writes nothing and still answers 200
// with a grantedAt. A patient would be told their consent was registered when
// no consent exists. The assertion stays as it should behave.
test("a consent for an unknown programme is refused, not silently dropped", function () {
  expect([400, 404]).to.include(res.getStatus());
});
""")

# ===========================================================================
f = folder("02 Data Holder", "A hospital: AlphaKlinik Berlin (DATA_HOLDER)",
"""Chapter IV duties of a health data holder: describe the datasets you hold so an access
body and a data user can find them (Art. 55, HealthDCAT-AP), keep the technical asset and
its ODRL policy behind each description, and see the exchanges your connector took part in.
The dataset published here is withdrawn two requests later.""")
req(f, "01 My organisation", "get", f"{B}/api/participants/me", persona="clinic", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray"])
req(f, "02 The catalogue I publish (Art. 55)", "get", f"{B}/api/catalog", persona="clinic", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].id: isDefined", "res.body[0].title: isDefined"],
    docs="HealthDCAT-AP dataset descriptions. This is what a data user discovers.")
req(f, "03 I describe a new dataset", "post", f"{B}/api/catalog", persona="clinic",
    body={"id": "dataset:bruno-smoke", "title": "Bruno smoke dataset",
          "description": "Published by the API collection; withdrawn two requests later.",
          "publisher": "AlphaKlinik Berlin", "license": "https://creativecommons.org/licenses/by/4.0/"},
    asserts=["res.status: eq 200", "res.body.ok: eq true", "res.body.id: eq dataset:bruno-smoke"])
req(f, "04 It is in my catalogue", "get", f"{B}/api/catalog", persona="clinic",
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("the dataset just described is listed", function () {
  const ids = res.getBody().map((d) => d.id);
  expect(ids, "the dataset published in the previous request is not in the catalogue").to.include("dataset:bruno-smoke");
});
""")
req(f, "05 I withdraw it", "delete", f"{B}/api/catalog?id=dataset:bruno-smoke", persona="clinic",
    asserts=["res.status: eq 200", "res.body.ok: eq true"])
req(f, "06 The EDC assets behind my datasets", "get", f"{B}/api/assets", persona="clinic", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("captures my participant context id", function () {
  const rows = res.getBody();
  const mine = rows.find((r) => JSON.stringify(r).includes("alpha-klinik")) || rows[0];
  if (mine) bru.setVar("uiParticipantId", mine.participantId || mine.identity);
});
""")
req(f, "07 The policies governing them (ODRL)", "get", f"{B}/api/admin/policies?participantId={{{{uiParticipantId}}}}",
    persona="clinic",
    tests="""
// Policy administration is an access-body and operator surface. A data holder
// either sees its own policies or is refused; both are defensible, an error is
// not.
test("answers with my policies or refuses cleanly", function () {
  expect([200, 403]).to.include(res.getStatus());
});
""")
req(f, "08 Negotiations my connector took part in", "get",
    f"{B}/api/negotiations?participantId={{{{uiParticipantId}}}}", persona="clinic", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("every row says whether it can be opened (#358)", function () {
  const rows = res.getBody();
  rows.forEach((r) => {
    expect(r, "a listed row carries no provenance").to.have.property("source");
    expect(r).to.have.property("openable");
  });
  // Only a control-plane row can be opened; the list also carries demo and
  // bundled-mock rows so the walkthrough stays demonstrable.
  const openable = rows.find((r) => r.openable);
  bru.setVar("negotiationId", openable ? openable["@id"] : "");
});
""",
    docs="""The list merges what the control plane holds with the demo negotiations the walkthrough
records (`ui/src/lib/demo-records.ts`), so a row here is not always one the connector knows. Opening one by id
belongs to folder 10, where the id comes from the control plane itself.""")
req(f, "09 Transfers my connector took part in", "get",
    f"{B}/api/transfers?participantId={{{{uiParticipantId}}}}", persona="clinic", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("every row says whether it can be opened (#358)", function () {
  const rows = res.getBody();
  rows.forEach((r) => {
    expect(r, "a listed row carries no provenance").to.have.property("source");
    expect(r).to.have.property("openable");
  });
  const openable = rows.find((r) => r.openable);
  bru.setVar("transferId", openable ? openable["@id"] : "");
});
""")
req(f, "10 Open one negotiation the hub showed me", "get",
    f"{B}/api/negotiations/{{{{negotiationId}}}}?participantId={{{{uiParticipantId}}}}", persona="clinic",
    tests="""
if (!bru.getVar("negotiationId")) {
  test("SKIPPED: this stack holds no control-plane negotiation to open", function () {});
} else {
  // Only rows the control plane holds are captured now (#358), so this must
  // open. A 502 here means the list marked a row openable that is not.
  test("a row marked openable can be opened", function () {
    expect(res.getStatus()).to.equal(200);
  });
}
""")
req(f, "11 Open one transfer the hub showed me", "get",
    f"{B}/api/transfers/{{{{transferId}}}}?participantId={{{{uiParticipantId}}}}", persona="clinic",
    tests="""
if (!bru.getVar("transferId")) {
  test("SKIPPED: this stack holds no control-plane transfer to open", function () {});
} else {
  test("a row marked openable can be opened", function () {
    expect(res.getStatus()).to.equal(200);
  });
}
""",
    docs="Same provenance rule as request 10 (#358).")
req(f, "12 What my organisation is allowed to do (ODRL scope)", "get", f"{B}/api/odrl/scope", persona="clinic",
    asserts=["res.status: eq 200", "res.body.permissions: isArray", "res.body.prohibitions: isArray"])
req(f, "13 Starting a negotiation without an offer (400)", "post", f"{B}/api/negotiations", persona="clinic",
    body={},
    asserts=["res.status: eq 400", "res.body.error: contains counterPartyAddress"],
    docs="A real negotiation needs an offer id from the provider's catalogue, which folder 10 shows is not reachable yet (#345).")
req(f, "14 Starting a transfer without a contract (400)", "post", f"{B}/api/transfers", persona="clinic",
    body={},
    asserts=["res.status: eq 400", "res.body.error: contains contractId"])
req(f, "11 A dataset without a title (400)", "post", f"{B}/api/catalog", persona="clinic", body={},
    asserts=["res.status: eq 400", "res.body.error: contains id and title"])
req(f, "12 An asset without an id (400)", "post", f"{B}/api/assets", persona="clinic",
    body={"participantId": "{{uiParticipantId}}"},
    asserts=["res.status: eq 400", "res.body.error: contains assetId"])

# ===========================================================================
f = folder("03 Data User", "A research organisation: PharmaCo Research AG (DATA_USER)",
"""Art. 53 secondary use from the data user's side, before and after a permit exists: find
the datasets, read what they contain and under what conditions, see what this organisation
is permitted to do today, and work in the analytics the permit allows. Applying for a permit
is the cross-persona journey in folder 07.""")
req(f, "01 Discover the catalogue (Art. 55)", "get", f"{B}/api/catalog", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].id: isDefined"],
    tests="""
test("captures a dataset to work with", function () {
  const sets = res.getBody();
  const omop = sets.find((d) => (d.id || "").includes("omop")) || sets[0];
  bru.setVar("datasetId", omop.id);
});
""")
req(f, "02 The EEHRxF profiles the datasets conform to", "get", f"{B}/api/eehrxf", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body.categories: isArray", "res.body.summary: isDefined"])
req(f, "03 What I am permitted today (ODRL)", "get", f"{B}/api/odrl/scope", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body.permissions: isArray", "res.body.prohibitions: isArray",
             "res.body.participantId: isDefined"])
req(f, "04 My applications and their clocks", "get", f"{B}/api/compliance/applications", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body.applications: isArray", "res.body.scope: isDefined"])
req(f, "05 My credentials (DCP)", "get", f"{B}/api/credentials", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body.credentials: isArray"])
req(f, "06 Cohort analytics (OMOP CDM)", "get", f"{B}/api/analytics", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body.summary: isDefined", "res.body.topConditions: isArray",
             "res.body.permit: isDefined"],
    docs="The dashboard carries the permit it was computed under; analytics with no permit behind it is the failure this guards against.")
req(f, "07 Federated cohort statistics", "get", f"{B}/api/federated", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body: isJson"],
    docs="Cross-site counts with k-anonymity, through the Neo4j proxy. A 502 here means the proxy image is older than the route (#349).")
req(f, "08 Natural-language query templates", "get", f"{B}/api/nlq", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "09 Which NLQ backend is answering", "get", f"{B}/api/nlq/backend", persona="researcher",
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "10 Ask a question in natural language", "post", f"{B}/api/nlq", persona="researcher",
    body={"question": "How many patients have a diagnosis of type 2 diabetes?"},
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "11 My tasks across the pipeline", "get", f"{B}/api/tasks", persona="researcher", mock=True,
    asserts=["res.status: eq 200", "res.body.tasks: isArray", "res.body.counts: isDefined"])

# ===========================================================================
f = folder("04 Access Body", "A health data access body: MedReg DE (HDAB_AUTHORITY)",
"""Chapter IV from the access body's side: the inbox of applications and data requests, the
findings it has opened under Art. 63, the audit trail it must keep and the retention rule
that governs it (Art. 73(1)(e)), and the compliance matrix it reports from. Deciding an
application is the journey in folder 07.""")
req(f, "01 Applications in my inbox (Art. 67)", "get", f"{B}/api/compliance/applications", persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.applications: isArray", "res.body.article: isDefined"])
req(f, "02 Data requests in my inbox (Art. 69)", "get", f"{B}/api/compliance/requests", persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.requests: isArray"])
req(f, "03 Findings I have opened (Art. 63)", "get", f"{B}/api/compliance/findings", persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.findings: isArray"])
req(f, "04 Information I have requested (Art. 63(1))", "get", f"{B}/api/compliance/information-requests",
    persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.requests: isArray"])
req(f, "05 The compliance matrix I report from", "get", f"{B}/api/compliance", persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.matrix: isArray", "res.body.datasets: isArray",
             "res.body.consumers: isArray"])
req(f, "06 Protocol conformance of the dataspace", "get", f"{B}/api/compliance/tck", persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.summary: isDefined", "res.body.suites: isDefined"],
    docs="The DSP, DCP and EHDS suite results as the Trust Center page shows them.")
req(f, "07 The audit trail (Art. 73)", "get", f"{B}/api/admin/audit?limit=20", persona="regulator",
    asserts=["res.status: eq 200", "res.body.summary: isDefined", "res.body.transfers: isArray",
             "res.body.negotiations: isArray"])
req(f, "08 The retention rule on that trail (Art. 73(1)(e))", "get", f"{B}/api/admin/audit/retention",
    persona="regulator",
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "09 Purging without confirmation (400)", "post", f"{B}/api/admin/audit/retention", persona="regulator", body={},
    asserts=["res.status: eq 400", "res.body.error: contains confirm", "res.body.policy: isDefined"],
    docs="Nothing is deleted before its retainUntil date, and never without an explicit confirm.")
req(f, "10 Policies across participants", "get", f"{B}/api/admin/policies", persona="regulator", mock=True,
    asserts=["res.status: eq 200", "res.body.participants: isArray"])
req(f, "11 My view of the dataspace", "get", f"{B}/api/overview", persona="regulator",
    asserts=["res.status: eq 200", "res.body.persona: isDefined", "res.body.layers: isDefined"])

# ===========================================================================
f = folder("05 Dataspace Operator", "The operator of the dataspace (EDC_ADMIN)",
"""Not a role the regulation names: whoever runs the infrastructure the other four use.
Tenants, components and their health, the participant registry behind federated discovery,
policy and credential administration, and the knowledge graph underneath. The participant
registered here is deregistered one request later.""")
req(f, "01 Tenants", "get", f"{B}/api/admin/tenants", mock=True,
    asserts=["res.status: eq 200", "res.body.tenants: isArray", "res.body.summary: isDefined"],
    tests="""
// Capture a CFM tenant id for request 14. A tenant id is not a participant
// context id: /api/participants/{id}/credentials asks the Tenant Manager for
// that tenant's participant profiles, and a context id there lists no profiles
// at all. Prefer a tenant that has profiles, so the request downstream has
// something to answer with.
//
// Report the count. `tenants: isArray` is satisfied by an empty array, and on
// CI this request passes while request 14 answers 502, which reads as a bug in
// 14 rather than as "this stack was never given a tenant". Saying the number
// out loud is what tells the two apart (#375).
test("captures a tenant id that has participant profiles", function () {
  const tenants = res.getBody().tenants || [];
  const withProfiles = tenants.find((t) => (t.participantProfiles || []).length > 0);
  const pick = withProfiles || tenants[0];
  if (pick) bru.setVar("tenantId", pick.id);
  console.log(`[tenants] ${tenants.length} tenant(s), ${tenants.filter((t) => (t.participantProfiles || []).length > 0).length} with participant profiles`);
});
""")
req(f, "02 Components and their state", "get", f"{B}/api/admin/components", mock=True,
    asserts=["res.status: eq 200", "res.body.components: isDefined", "res.body.deploymentTarget: isDefined"])
req(f, "03 How the components connect", "get", f"{B}/api/admin/components/topology", mock=True,
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "04 Diagnose one component", "get", f"{B}/api/admin/components/controlplane/diagnosis",
    asserts=["res.status: eq 200", "res.body.name: eq controlplane", "res.body.severity: isDefined"])
req(f, "05 Restarting an unknown component (400)", "post", f"{B}/api/admin/components/not-a-component/restart", body={},
    asserts=["res.status: eq 400", "res.body.error: isDefined"],
    docs="Restart acts on the Azure deployment; on a compose stack every component answers 400, which is the documented behaviour.")
req(f, "06 The participant registry", "get", f"{B}/api/admin/participants", mock=True,
    asserts=["res.status: eq 200", "res.body.participants: isArray", "res.body.summary: isDefined"])
req(f, "07 Register a participant for federated discovery", "post", f"{B}/api/admin/participants",
    body={"participantId": "did:web:bruno.example:probe", "name": "Bruno probe clinic",
          "participantType": "HealthcareProvider", "country": "DE", "source": "business-wallet",
          "walletType": "business", "dspCatalogUrl": "https://bruno.example/api/dsp", "crawlerEnabled": False},
    asserts=["res.status: eq 201", "res.body.ok: eq true", "res.body.participantId: eq did:web:bruno.example:probe"])
req(f, "08 Deregister the one I just registered", "delete",
    f"{B}/api/admin/participants?id=did:web:bruno.example:probe",
    asserts=["res.status: eq 200", "res.body.ok: eq true"],
    docs="""Only ever the participant this folder created. A seeded participant is protected by a 409 that
keys on `p.source = "seed"`, which only neo4j/participant-source-init.cypher sets; on a stack where
that file has not run, deleting a seeded DID succeeds and orphans its graph (#349).""")
req(f, "09 Registering a non-DID (400)", "post", f"{B}/api/admin/participants", body={"participantId": "not-a-did"},
    asserts=["res.status: eq 400", "res.body.error: contains did:web"])
req(f, "10 Deregistering someone who is not there (404)", "delete",
    f"{B}/api/admin/participants?id=did:web:nobody.example:x",
    asserts=["res.status: eq 404"])
req(f, "11 Participants as the hub lists them", "get", f"{B}/api/participants", mock=True,
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0]: isDefined"])
req(f, "12 Onboard a participant, without a name (400)", "post", f"{B}/api/participants", body={},
    asserts=["res.status: eq 400", "res.body.error: contains displayName"],
    docs="A full create provisions a CFM tenant and is not part of a smoke run; jad/seed-health-tenants.sh does that.")
req(f, "13 Change a participant, with nothing to change (400)", "patch",
    f"{B}/api/participants/{{{{uiParticipantId}}}}", body={},
    asserts=["res.status: eq 400", "res.body.error: contains properties"])
# No `asserts` here on purpose: a hard assert fires even when the tests block
# decides to skip, so the status and shape checks live inside the branch below.
req(f, "14 The credentials a tenants participants hold", "get",
    f"{B}/api/participants/{{{{tenantId}}}}/credentials",
    tests="""
// This used to pass {{uiParticipantId}}, a participant context id, where the
// route wants a CFM tenant id. The Tenant Manager listed no profiles for it,
// so the route answered `[]` and `isArray` was satisfied by an empty array:
// green while showing nothing (#369).
//
// Request 01 captures the tenant id. Where CFM never provisioned a tenant,
// there is nothing to capture and no subject for this request, so it skips
// loudly rather than sending a literal placeholder and reporting the opaque
// 502 that comes back. That is what it did on CI after #369, which made a
// missing tenant look like a broken route.
if (!bru.getVar("tenantId")) {
  test("SKIPPED: this stack has no CFM tenant, so no participant profiles to read", function () {});
} else {
  test("the tenant has at least one participant profile", function () {
    expect(res.getStatus()).to.equal(200);
    expect(res.getBody()).to.be.an("array").that.is.not.empty;
  });
  test("each profile names its context and carries a credentials array", function () {
    for (const entry of res.getBody()) {
      expect(entry.participantContextId, "participantContextId").to.be.a("string");
      expect(entry.credentials, "credentials").to.be.an("array");
    }
  });
}
""")
req(f, "15 The patient index and cohort statistics", "get", f"{B}/api/patient", mock=True,
    asserts=["res.status: eq 200", "res.body.patients: isArray", "res.body.stats: isDefined"])
req(f, "16 Credential definitions on the issuer", "get", f"{B}/api/credentials/definitions",
    asserts=["res.status: eq 200", "res.body.definitions: isArray"])
req(f, "13 Credentials held across the dataspace", "get", f"{B}/api/credentials", mock=True,
    asserts=["res.status: eq 200", "res.body.credentials: isArray"])
req(f, "14 Requesting a credential without a context (400)", "post", f"{B}/api/credentials/request", body={},
    asserts=["res.status: eq 400", "res.body.error: contains participantContextId"])
req(f, "15 Deleting a credential that is not there (404)", "delete", f"{B}/api/credentials/does-not-exist",
    asserts=["res.status: eq 404", "res.body.error: contains not found"])
req(f, "16 A policy without a participant (400)", "post", f"{B}/api/admin/policies", body={},
    asserts=["res.status: eq 400", "res.body.error: contains policy"])
req(f, "17 Updating a policy without one (400)", "put", f"{B}/api/admin/policies", body={},
    asserts=["res.status: eq 400", "res.body.error: contains policy"])
req(f, "18 Deleting a policy without an id (400)", "delete", f"{B}/api/admin/policies", body={},
    asserts=["res.status: eq 400", "res.body.error: contains policyId"])
req(f, "19 The graph behind all of it", "get", f"{B}/api/graph?layer=all&persona=edc-admin&limit=200", mock=True,
    asserts=["res.status: eq 200", "res.body.nodes: isArray", "res.body.links: isArray"],
    tests="""
test("captures a node id", function () {
  const nodes = res.getBody().nodes || [];
  expect(nodes.length, "the graph returned no nodes").to.be.above(0);
  bru.setVar("graphNodeId", nodes[0].id);
});
""")
req(f, "20 One node of the graph", "get", f"{B}/api/graph/node?id={{{{graphNodeId}}}}",
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "21 Its neighbourhood", "get", f"{B}/api/graph/expand?id={{{{graphNodeId}}}}&depth=1",
    asserts=["res.status: eq 200", "res.body.nodes: isArray", "res.body.links: isArray"])
req(f, "22 Does the graph match its schema", "get", f"{B}/api/graph/validate",
    asserts=["res.status: eq 200", "res.body.summary: isDefined", "res.body.nodeCounts: isDefined"])
req(f, "23 A node that is not there (404)", "get", f"{B}/api/graph/node?id=does-not-exist",
    asserts=["res.status: eq 404", "res.body.error: isDefined"])
req(f, "24 Phase 26 debug view", "get", f"{B}/api/debug/phase26",
    asserts=["res.status: eq 200", "res.body: isJson"])

# ===========================================================================
f = folder("06 Trust Centre", "The trust centre operator (TRUST_CENTER_OPERATOR)",
"""Art. 73 secure processing environment and the attestation chain behind it: which trust
centres exist, which SPE sessions are open, and the demo DSP catalogue a partner fetches
while the connector's own endpoint is unreachable.""")
req(f, "01 Trust centres and open SPE sessions", "get", f"{B}/api/trust-center",
    asserts=["res.status: eq 200", "res.body.trustCenters: isArray", "res.body.speSessions: isArray"],
    docs="Sent as the dataspace operator: the compose realm has no dedicated trust-centre user and the route admits EDC_ADMIN.")
req(f, "02 The demo DSP catalogue a partner would fetch", "get",
    f"{B}/api/mock-dsp/alpha-klinik/catalog/request", persona="anon",
    asserts=["res.status: eq 200", "res.body['@type']: eq dcat:Catalog"],
    docs="The provider endpoint the walkthrough uses while the connector's own DSP endpoint does not answer (#345).")
req(f, "03 The same over POST, as DSP sends it", "post", f"{B}/api/mock-dsp/alpha-klinik/catalog/request",
    persona="anon", body={"@context": {"dspace": "https://w3id.org/dspace/2025/1/"},
                          "@type": "dspace:CatalogRequestMessage"},
    asserts=["res.status: eq 200", "res.body['@type']: eq dcat:Catalog"])

# ===========================================================================
f = folder("07 Journey - Data permit", "Art. 67 to 73: application, permit, results, supervision",
"""The two-sided procedure the regulation defines, in the order it runs. The acting persona
changes from request to request; each request says which one it is and the collection carries
the ids between them. One run adds one application, one permit, one finding and one closed
supervision cycle to the graph.

  data user   -> an application carrying the eleven Art. 67(2) items
  data user   -> declares it complete, the three-month clock starts (Art. 68(4))
  access body -> extends the clock, then issues the permit (Art. 68)
  anyone      -> the permit appears in the Art. 73 register
  data user   -> communicates its results (Art. 70)
  access body -> opens a finding (Art. 63); the party states its views (Art. 63(2))
  access body -> asks for information; the party answers (Art. 63(1))
  access body -> closes the finding with a measure and revokes the permit (Art. 63(3))""")
APP = {
    "name": "Bruno: HbA1c trajectories in type 2 diabetes",
    "datasetId": "{{datasetId}}",
    "purpose": "SCIENTIFIC_RESEARCH",
    "justification": "Retrospective cohort study of HbA1c trajectories under second-line therapy",
    "namedPersons": "Dr. Klaus Berger (principal investigator), two data scientists",
    "intendedUse": "Retrospective cohort analysis inside the secure processing environment",
    "requestedData": "OMOP condition_occurrence, measurement and drug_exposure",
    "dataTimeRange": "2018-01-01 to 2025-12-31",
    "dataFormats": "OMOP CDM v5.4 parquet",
    "identifiability": "PSEUDONYMISED",
    "pseudonymisationJustification": "Longitudinal linkage across visits is required",
    "datasetsBroughtIn": "none",
    "safeguards": "Secure processing environment only; no record-level export",
    "speTools": "R 4.3, Python 3.11",
    "art71Exception": False,
    "applicantCategory": "COMMERCIAL",
    "dataMinimisationStatement": "Only the three OMOP tables named above",
    "processingPeriodMonths": 12,
    "ethicsCommitteeRef": "EK-2026-0412",
}
req(f, "01 Data user picks the dataset", "get", f"{B}/api/catalog", persona="researcher",
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("captures the dataset the application is for", function () {
  const sets = res.getBody();
  const omop = sets.find((d) => (d.id || "").includes("omop")) || sets[0];
  expect(omop, "the catalogue is empty; seed the graph first").to.not.equal(undefined);
  bru.setVar("datasetId", omop.id);
});
""")
req(f, "02 Data user applies (Art. 67(2), eleven items)", "post", f"{B}/api/compliance/applications",
    persona="researcher", body=APP,
    asserts=["res.status: eq 201", "res.body.applicationId: isDefined", "res.body.status: eq PENDING",
             "res.body.completeness.complete: eq true", "res.body.decisionDue: isDefined"],
    tests="""
test("captures applicationId", function () {
  bru.setVar("applicationId", res.getBody().applicationId);
});
""",
    docs="A complete application carries all eleven items of Art. 67(2); the response names the missing ones when it does not.")
req(f, "03 Data user declares it complete (Art. 68(4))", "post", f"{B}/api/compliance/applications/complete",
    persona="researcher", body={"applicationId": "{{applicationId}}"},
    asserts=["res.status: eq 200", "res.body.completeness.complete: eq true", "res.body.clockState: eq running",
             "res.body.daysToDecision: isDefined"])
req(f, "04 Access body extends the clock (Art. 68(4))", "post", f"{B}/api/compliance/applications/clock",
    persona="regulator",
    body={"applicationId": "{{applicationId}}", "action": "EXTEND",
          "reason": "High number of requests in the period"},
    asserts=["res.status: eq 200", "res.body.extended: eq true", "res.body.clockState: eq extended"])
req(f, "05 Access body issues the permit (Art. 68)", "post", f"{B}/api/compliance/permits", persona="regulator",
    body={"applicationId": "{{applicationId}}", "decision": "APPROVED",
          "justification": "Purpose within Art. 53(1)(e); pseudonymised data in the SPE is proportionate",
          "validUntil": "2027-12-31",
          "conditions": "Secure processing environment only; outputs checked before release",
          "criteria": "Art. 53(1)(e), Art. 66(1)", "purpose": "SCIENTIFIC_RESEARCH", "datasetId": "{{datasetId}}",
          "riskNote": "low",
          "statisticalAlternative": "anonymised statistics would not support the longitudinal model"},
    asserts=["res.status: eq 200", "res.body.permitId: isDefined", "res.body.decision: eq APPROVED"],
    tests="""
test("captures permitId", function () {
  bru.setVar("permitId", res.getBody().permitId);
});
""")
req(f, "06 The permit is in the public register (Art. 73)", "get", f"{B}/api/permits", persona="anon",
    asserts=["res.status: eq 200", "res.body.entries: isArray"],
    tests="""
test("the permit just issued is published", function () {
  const ids = (res.getBody().entries || []).map((e) => e.permitId || e.id);
  expect(ids, "the permit is not in the Art. 73 register").to.include(bru.getVar("permitId"));
});
""")
req(f, "07 Data user communicates results (Art. 70)", "post", f"{B}/api/compliance/results", persona="researcher",
    body={"permitId": "{{permitId}}", "title": "HbA1c trajectories under second-line therapy, preprint",
          "summary": "Aggregate results only; no record-level data left the secure processing environment",
          "kind": "PUBLICATION", "url": "https://example.org/preprints/hba1c-trajectories"},
    asserts=["res.status: eq 201", "res.body.resultId: isDefined", "res.body.onTime: eq true"])
req(f, "08 Access body opens a finding (Art. 63)", "post", f"{B}/api/compliance/findings", persona="regulator",
    body={"permitId": "{{permitId}}", "partyDid": "did:web:pharmaco.de:research",
          "description": "An export attempt was logged by the secure processing environment",
          "gdprBreach": False},
    asserts=["res.status: eq 201", "res.body.findingId: isDefined", "res.body.status: eq OPEN",
             "res.body.respondBy: isDefined"],
    tests="""
test("captures findingId", function () {
  bru.setVar("findingId", res.getBody().findingId);
});
""")
req(f, "09 The party states its views (Art. 63(2))", "post", f"{B}/api/compliance/findings/respond",
    persona="researcher",
    body={"findingId": "{{findingId}}",
          "views": "The export was an aggregate table meeting the five-anonymity rule"},
    asserts=["res.status: eq 200", "res.body.status: eq VIEWS_RECEIVED"])
req(f, "10 Access body asks for information (Art. 63(1))", "post", f"{B}/api/compliance/information-requests",
    persona="regulator",
    body={"partyDid": "did:web:pharmaco.de:research", "permitId": "{{permitId}}", "findingId": "{{findingId}}",
          "question": "Which table was exported and under which output check?"},
    asserts=["res.status: eq 201", "res.body.requestId: isDefined", "res.body.status: eq OPEN"],
    tests="""
test("captures infoRequestId", function () {
  bru.setVar("infoRequestId", res.getBody().requestId);
});
""")
req(f, "11 The party answers", "post", f"{B}/api/compliance/information-requests/answer", persona="researcher",
    body={"requestId": "{{infoRequestId}}",
          "answer": "An aggregate count table; output check reference OC-2026-118"},
    asserts=["res.status: eq 200", "res.body.status: eq ANSWERED"])
req(f, "12 Access body closes the finding with a measure", "post", f"{B}/api/compliance/findings/close",
    persona="regulator",
    body={"findingId": "{{findingId}}", "measure": "WARNING",
          "note": "Closed after the party's explanation; the output check was confirmed"},
    asserts=["res.status: eq 200", "res.body.status: eq CLOSED", "res.body.measure: eq WARNING"])
req(f, "13 Access body revokes the permit (Art. 63(3))", "post", f"{B}/api/compliance/permits/revoke",
    persona="regulator",
    body={"permitId": "{{permitId}}", "reason": "End of the collection run; the permit is no longer needed"},
    asserts=["res.status: eq 200", "res.body.decision: eq REVOKED", "res.body.revokedAt: isDefined"])
req(f, "14 An application with no items (400)", "post", f"{B}/api/compliance/applications", persona="researcher",
    body={},
    asserts=["res.status: eq 400", "res.body.error: contains datasetId", "res.body.purposes: isArray"])
req(f, "15 A purpose outside Art. 53(1) (400)", "post", f"{B}/api/compliance/applications", persona="researcher",
    body={"datasetId": "{{datasetId}}", "purpose": "MARKETING", "justification": "targeted advertising"},
    asserts=["res.status: eq 400", "res.body.purposes: isArray"],
    docs="Art. 54 prohibits advertising outright; the route accepts only the Art. 53(1) list and returns it.")
req(f, "16 Revoking a permit that is not there (404)", "post", f"{B}/api/compliance/permits/revoke",
    persona="regulator", body={"permitId": "permit-does-not-exist", "reason": "probe"},
    asserts=["res.status: eq 404"])

# ===========================================================================
f = folder("08 Journey - Data request", "Art. 69: a question answered in anonymised statistics",
"""The lighter of the two procedures: a data user asks a question whose answer is an anonymised
statistic, and the access body decides it without issuing a permit. The route also tries to
answer the question through the statistical service, which may be down; the decision is what
is asserted here.""")
req(f, "01 Data user asks a question (Art. 69)", "post", f"{B}/api/compliance/requests", persona="researcher",
    body={"question": "How many patients with type 2 diabetes had an HbA1c above 9 percent in 2024?",
          "purpose": "SCIENTIFIC_RESEARCH", "statisticalContent": "One count, k-anonymity threshold 5",
          "datasetId": "{{datasetId}}", "safeguards": "aggregate only",
          "legalBasis": "Regulation (EU) 2025/327, Art. 69"},
    asserts=["res.status: eq 201", "res.body.requestId: isDefined", "res.body.status: isDefined"],
    tests="""
test("captures dataRequestId", function () {
  bru.setVar("dataRequestId", res.getBody().requestId);
});
""")
req(f, "02 A refusal without justification (400)", "post", f"{B}/api/compliance/requests/decide",
    persona="regulator", body={"requestId": "{{dataRequestId}}", "decision": "REJECTED"},
    asserts=["res.status: eq 400", "res.body.error: contains justification"],
    docs="Art. 57(1)(j)(iii): a refusal must be reasoned.")
req(f, "03 A decision that is neither (400)", "post", f"{B}/api/compliance/requests/decide", persona="regulator",
    body={"requestId": "{{dataRequestId}}", "decision": "MAYBE"},
    asserts=["res.status: eq 400", "res.body.error: contains APPROVED or REJECTED"])
req(f, "04 Access body approves it", "post", f"{B}/api/compliance/requests/decide", persona="regulator",
    body={"requestId": "{{dataRequestId}}", "decision": "APPROVED",
          "justification": "An anonymised statistic within Art. 69"},
    asserts=["res.status: eq 200", "res.body.decision: eq APPROVED", "res.body.publishBy: isDefined"],
    docs="`answered` is false when the statistical service is unreachable; that is the proxy's state, not the decision's, so it is not asserted.")
req(f, "05 The decision is on my request", "get", f"{B}/api/compliance/requests", persona="researcher",
    asserts=["res.status: eq 200", "res.body.requests: isArray"],
    tests="""
test("my request now carries the decision", function () {
  const mine = (res.getBody().requests || []).find((r) => r.requestId === bru.getVar("dataRequestId"));
  expect(mine, "the request just decided is not in my list").to.not.equal(undefined);
  expect(mine.status, "the decision is not on the request").to.not.equal("PENDING");
});
""")

# ===========================================================================
f = folder("09 Access control", "Who may do what: the role boundaries, asserted",
"""One request per boundary the role matrix claims, each expecting the refusal. A green run here
is the evidence that the matrix in .claude/rules/api-conventions.md is what the code does.
Anonymous requests carry a cookie value that is not a session, which is what an expired or
forged cookie looks like to the server.""")
req(f, "01 No session, participants (401)", "get", f"{B}/api/participants", persona="anon",
    asserts=["res.status: eq 401"])
req(f, "02 No session, tenants (401)", "get", f"{B}/api/admin/tenants", persona="anon",
    asserts=["res.status: eq 401"])
req(f, "03 No session, a patient record (401)", "get", f"{B}/api/patient/profile?patientId={{{{patientId}}}}",
    persona="anon", asserts=["res.status: eq 401"])
req(f, "04 No session, the audit trail (401)", "get", f"{B}/api/admin/audit", persona="anon",
    asserts=["res.status: eq 401"])
req(f, "05 No session, the patient index", "get", f"{B}/api/patient", persona="anon",
    tests="""
// Gated, #357 reopened. This was the one route in the inventory that read a
// session and then answered anyway, so the code and the role matrix disagreed.
// It now enforces what the matrix says, and /patient joins PROTECTED_PATHS so
// a visitor is sent to sign in rather than shown an empty page.
//
// Assert the refusal carries a body, not only a status: every route in this
// hub answers an error as { error: string }, and a bare 401 with no body is a
// different contract that a partner would have to special-case.
test("the patient index needs a session", function () {
  expect(res.getStatus()).to.equal(401);
});
test("the refusal says so in the body", function () {
  expect(res.getBody(), "an { error } body").to.have.property("error");
});
""")
req(f, "06 Data user cannot read a patient record (403)", "get",
    f"{B}/api/patient/profile?patientId={{{{patientId}}}}", persona="researcher",
    asserts=["res.status: eq 403"])
req(f, "06 Data holder cannot read a patient record (403)", "get",
    f"{B}/api/patient/profile?patientId={{{{patientId}}}}", persona="clinic",
    asserts=["res.status: eq 403"])
req(f, "07 Access body cannot read a patient record (403)", "get",
    f"{B}/api/patient/profile?patientId={{{{patientId}}}}", persona="regulator",
    asserts=["res.status: eq 403"],
    docs="Secondary use never reaches an identified record: the access body sees applications and permits, not patients.")
req(f, "08 Data user cannot issue a permit (403)", "post", f"{B}/api/compliance/permits", persona="researcher",
    body={"applicationId": "app-whatever", "decision": "APPROVED"},
    asserts=["res.status: eq 403"])
req(f, "09 Patient cannot touch the Art. 68 clock (403)", "post", f"{B}/api/compliance/applications/clock",
    persona="patient", body={"applicationId": "app-whatever", "action": "EXTEND"},
    asserts=["res.status: eq 403"])
req(f, "10 Data user cannot publish a dataset (403)", "post", f"{B}/api/catalog", persona="researcher",
    body={"id": "dataset:bruno-forbidden", "title": "should never exist"},
    asserts=["res.status: eq 403"])
req(f, "11 Access body cannot read the component list (403)", "get", f"{B}/api/admin/components",
    persona="regulator", asserts=["res.status: eq 403"])
req(f, "12 Data user cannot read tenants (403)", "get", f"{B}/api/admin/tenants", persona="researcher",
    asserts=["res.status: eq 403"])
req(f, "13 Patient cannot read the audit trail (403)", "get", f"{B}/api/admin/audit", persona="patient",
    asserts=["res.status: eq 403"])
req(f, "14 Access body cannot open the trust centre (403)", "get", f"{B}/api/trust-center", persona="regulator",
    asserts=["res.status: eq 403"])
req(f, "15 Data user cannot register a participant (403)", "post", f"{B}/api/admin/participants",
    persona="researcher", body={"participantId": "did:web:bruno.example:sneak", "name": "should never exist"},
    asserts=["res.status: eq 403"])

# ===========================================================================
f = folder("10 Connecting partner", "A partner's own connector: DSP 2025-1 and DCP v1.0",
"""Not through the hub's web API. These are the EDC surfaces a hospital or a research
organisation speaks to when it connects its own connector: the Management API of the control
plane, the IdentityHub that holds its keys and credentials, and the IssuerService that issues
them. On Azure these run on internal addresses and are unreachable from outside, so the folder
runs against the compose stack and in CI only.

  00-01  two client-credentials tokens, one for the Management API, one for the issuer
  10-15  the provider's assets, policies and contract definitions; the consumer's exchanges
  16     the DSP catalogue request, the row that is known to fail (#345)
  20-23  IdentityHub: contexts, keys, credentials held
  30-33  IssuerService: definitions, holders, attestations, issuance processes
  40-41  DCP issuance end to end: request a MembershipCredential and watch it arrive
  50     one contract negotiation, opened by an id the control plane really has""")
req(f, "00 Token for the Management API", "post",
    "{{keycloakUrl}}/realms/edcv/protocol/openid-connect/token", persona="anon",
    form={"grant_type": "client_credentials", "client_id": "{{edcClientId}}",
          "client_secret": "{{edcClientSecret}}"},
    asserts=["res.status: eq 200", "res.body.access_token: isDefined"],
    tests="""
test("stores the token for this folder", function () {
  bru.setVar("edcToken", res.getBody().access_token);
});
""")
req(f, "01 Token for the IssuerService admin API", "post",
    "{{keycloakUrl}}/realms/edcv/protocol/openid-connect/token", persona="anon",
    form={"grant_type": "client_credentials", "client_id": "{{issuerClientId}}",
          "client_secret": "{{issuerClientSecret}}",
          "scope": "issuer-admin-api:read issuer-admin-api:write"},
    asserts=["res.status: eq 200", "res.body.access_token: isDefined"],
    tests="""
test("stores the issuer token for this folder", function () {
  bru.setVar("issuerToken", res.getBody().access_token);
});
""",
    docs="The `issuer` client lives in jad/keycloak-realm.json and is pinned by a Vitest assertion (#345); without it every issuer request answers 401.")
QS = {"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "QuerySpec"}
req(f, "10 Participant contexts on the control plane", "get", "{{mgmtUrl}}/{{mgmtVersion}}/participants",
    persona="anon", bearer="edcToken",
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].identity: isDefined"],
    tests="""
test("captures the provider and consumer contexts by their DID", function () {
  const list = res.getBody();
  const byDid = (slug) => list.find((p) => (p.identity || "").endsWith(":" + slug));
  const provider = byDid("alpha-klinik"), consumer = byDid("pharmaco");
  expect(provider, "no context whose DID ends in :alpha-klinik").to.not.equal(undefined);
  expect(consumer, "no context whose DID ends in :pharmaco").to.not.equal(undefined);
  bru.setVar("providerCtx", provider["@id"]);
  bru.setVar("providerDid", provider.identity);
  bru.setVar("consumerCtx", consumer["@id"]);
});
""",
    docs="Context ids differ per stack: CFM mints hex ids on the compose stack, the CI seed uses slugs. Everything downstream keys on the DID, never on the id.")
req(f, "11 The provider's assets", "post",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{providerCtx}}/assets/request",
    persona="anon", bearer="edcToken", body=QS,
    asserts=["res.status: eq 200", "res.body: isArray"],
    docs="`{}` is rejected: the Management API wants a JSON-LD QuerySpec carrying its @context.")
req(f, "12 The provider's policy definitions (ODRL)", "post",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{providerCtx}}/policydefinitions/request",
    persona="anon", bearer="edcToken", body=QS,
    asserts=["res.status: eq 200", "res.body: isArray"])
req(f, "13 The provider's contract definitions", "post",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{providerCtx}}/contractdefinitions/request",
    persona="anon", bearer="edcToken", body=QS,
    asserts=["res.status: eq 200", "res.body: isArray"])
req(f, "14 The consumer's contract negotiations", "post",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{consumerCtx}}/contractnegotiations/request",
    persona="anon", bearer="edcToken", body=QS,
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("captures a negotiation the control plane really holds", function () {
  const rows = res.getBody();
  bru.setVar("realNegotiationId", rows.length ? rows[0]["@id"] : "");
});
""")
req(f, "15 The consumer's transfer processes", "post",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{consumerCtx}}/transferprocesses/request",
    persona="anon", bearer="edcToken", body=QS,
    asserts=["res.status: eq 200", "res.body: isArray"])
req(f, "16 DSP the consumer asks for the provider's catalogue", "post",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{consumerCtx}}/catalog/request",
    persona="anon", bearer="edcToken",
    body={"@context": ["https://w3id.org/edc/connector/management/v2"], "@type": "CatalogRequest",
          "counterPartyAddress": "{{dspInternalUrl}}/{{providerCtx}}/2025-1",
          "counterPartyId": "{{providerDid}}", "protocol": "dataspace-protocol-http:2025-1"},
    asserts=["res.status: eq 200", "res.body['@type']: isDefined"],
    docs="""Known red since 2026-09-26 in both environments: `No provider dispatcher registered for
protocol: dataspace-protocol-http:2025-1` (#345). The consumer control plane never sends the
message, so the provider's 404 was never the first problem. The request stays here so the
message stays visible until it is fixed.""")
req(f, "20 IdentityHub participant contexts", "get", "{{identityUrl}}/v1alpha/participants",
    persona="anon", bearer="edcToken",
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].did: isDefined"])
req(f, "21 IdentityHub the provider's context", "get", "{{identityUrl}}/v1alpha/participants/{{providerCtx}}",
    persona="anon", bearer="edcToken",
    asserts=["res.status: eq 200", "res.body.did: isDefined", "res.body.state: isDefined"],
    docs="The path takes the raw context id, not base64.")
req(f, "22 IdentityHub the provider's key pairs", "get",
    "{{identityUrl}}/v1alpha/participants/{{providerCtx}}/keypairs", persona="anon", bearer="edcToken",
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].keyId: isDefined"],
    docs="A key record here is not key material in Vault; KEY-2.4 of the identity suite checks the material (#345).")
req(f, "23 IdentityHub the credentials the provider holds", "get",
    "{{identityUrl}}/v1alpha/participants/{{providerCtx}}/credentials", persona="anon", bearer="edcToken",
    asserts=["res.status: eq 200", "res.body: isArray"],
    tests="""
test("captures how many credentials the provider holds now", function () {
  bru.setVar("credentialsBefore", String(res.getBody().length));
});
""")
req(f, "30 IssuerService credential definitions", "post",
    "{{issuerUrl}}/v1alpha/participants/issuer/credentialdefinitions/query",
    persona="anon", bearer="issuerToken", body={},
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].id: isDefined"],
    tests="""
test("captures the MembershipCredential definition id", function () {
  const defs = res.getBody();
  const def = defs.find((d) => (d.credentialType || "") === "MembershipCredential") || defs[0];
  expect(def, "the issuer has no credential definition to request").to.not.equal(undefined);
  bru.setVar("membershipDefinitionId", def.id);
});
""",
    docs="The issuer resolves a request by definition id, not by type; the type alone answers 400 'Credential definition ID null does not exist'.")
req(f, "31 IssuerService registered holders", "post",
    "{{issuerUrl}}/v1alpha/participants/issuer/holders/query", persona="anon", bearer="issuerToken", body={},
    asserts=["res.status: eq 200", "res.body: isArray", "res.body[0].did: isDefined"],
    docs="The issuer only issues to a DID it knows; scripts/seed-issuer-holders.sh registers them.")
req(f, "32 IssuerService attestation definitions", "post",
    "{{issuerUrl}}/v1alpha/participants/issuer/attestations/query", persona="anon", bearer="issuerToken", body={},
    asserts=["res.status: eq 200", "res.body: isArray"])
req(f, "33 IssuerService issuance processes", "post",
    "{{issuerUrl}}/v1alpha/participants/issuer/issuanceprocesses/query",
    persona="anon", bearer="issuerToken", body={},
    asserts=["res.status: eq 200", "res.body: isArray"])
req(f, "40 DCP the provider requests a MembershipCredential", "post",
    "{{identityUrl}}/v1alpha/participants/{{providerCtx}}/credentials/request",
    persona="anon", bearer="edcToken",
    body={"issuerDid": "{{issuerDid}}",
          "credentials": [{"id": "{{membershipDefinitionId}}", "type": "MembershipCredential",
                           "format": "VC1_0_JWT"}]},
    asserts=["res.status: gte 200", "res.status: lt 300"],
    docs="""The holder's IdentityHub sends a CredentialRequestMessage; the issuer approves it and delivers
to the CredentialService endpoint in the holder's DID document. Without that endpoint the process
sits at APPROVED forever, which is what CI did until #345.""")
req(f, "41 DCP the credential arrives", "get",
    "{{identityUrl}}/v1alpha/participants/{{providerCtx}}/credentials", persona="anon", bearer="edcToken",
    pre="""
// Issuance is asynchronous; give the issuer a moment to deliver.
await new Promise((resolve) => setTimeout(resolve, 8000));
""",
    tests="""
const before = Number(bru.getVar("credentialsBefore") || 0);
test("the provider holds one more credential than before", function () {
  expect(res.getStatus()).to.equal(200);
  expect(res.getBody().length,
    "the credential count did not rise; issuance is still running or has failed").to.be.above(before);
});
""")
req(f, "50 One contract negotiation, by a real id", "get",
    "{{mgmtUrl}}/{{mgmtVersion}}/participants/{{consumerCtx}}/contractnegotiations/{{realNegotiationId}}",
    persona="anon", bearer="edcToken",
    tests="""
if (!bru.getVar("realNegotiationId")) {
  test("SKIPPED: this stack holds no contract negotiation to open", function () {});
} else {
  test("opens the negotiation captured from the query", function () {
    expect(res.getStatus()).to.equal(200);
    expect(res.getBody()["@type"]).to.equal("ContractNegotiation");
  });
}
""",
    docs="""Deliberately not `/api/negotiations/<id>` through the hub: that list merges demo and bundled-mock
rows (`ui/src/lib/demo-records.ts`), so an id taken from it is often one the control plane never had and the detail route
answers 502. Here the id comes from the control plane itself.""")

# ===========================================================================
f = folder("11 Platform", "The Neo4j proxy behind the hub (port 9090)",
"""The Express bridge the hub calls for FHIR, OMOP, catalogue, federated statistics and NLQ.
Its routes are in services/neo4j-proxy/src/index.ts. When the proxy container is older than
that file these answer 404 and the hub's own routes answer 502; that is the pinned-image
finding in #349, not a flaky test.""")
req(f, "01 Proxy health", "get", "{{proxyUrl}}/health", persona="anon",
    asserts=["res.status: eq 200", "res.body.status: eq ok"])
req(f, "02 HealthDCAT-AP datasets from the graph", "get", "{{proxyUrl}}/catalog/datasets", persona="anon",
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "03 FHIR Patient search", "get", "{{proxyUrl}}/fhir/Patient", persona="anon",
    asserts=["res.status: eq 200", "res.body.resourceType: eq Bundle"])
req(f, "04 Federated statistics", "get", "{{proxyUrl}}/federated/stats", persona="anon",
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "05 NLQ templates", "get", "{{proxyUrl}}/nlq/templates", persona="anon",
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "06 Trust centre status", "get", "{{proxyUrl}}/trust-center/status", persona="anon",
    asserts=["res.status: eq 200", "res.body: isJson"])

# ===========================================================================
f = folder("12 EUDI wallet", "Sign-in with an EUDI wallet (optional stack)",
"""Only meaningful with docker-compose.eudi.yml running. scripts/run-api-tests.sh includes this
folder when BRUNO_EUDI=1.""")
req(f, "01 Start a wallet sign-in", "post", f"{B}/api/auth/eudi/start", persona="anon", body={},
    asserts=["res.status: eq 200", "res.body: isJson"])
req(f, "02 Poll a session that does not exist (404)", "get",
    f"{B}/api/auth/eudi/status?session=does-not-exist", persona="anon",
    asserts=["res.status: eq 404", "res.body.status: eq error"])

# ===========================================================================
# The GitHub Pages export has no API routes at all: the build renames
# ui/src/app/api/ and ui/src/lib/api.ts rewrites every GET to a fixture under
# /mock/. Sending {{baseUrl}}/api/... at it answers 404 for every request,
# which the old collection reported as a pass because its only assertion was
# status < 500: the Static-mock job had been green on 36 x 404 for months
# (#349).
#
# So the static export gets a folder of its own, generated from the same map
# the UI uses, asserting the shape of what the export really publishes. The
# mock=True requests above name the endpoint; each becomes a fixture request
# carrying the same body assertions.
def mock_map(root):
    """endpoint -> fixture path, read from ui/src/lib/api.ts so the two cannot
    drift apart silently."""
    src = open(os.path.join(root, "ui", "src", "lib", "api.ts"), encoding="utf-8").read()
    return dict(re.findall(r'"(/api/[^"]+)":\s*"(/mock/[^"]+)"', src))


MOCK = mock_map(ROOT)
f = folder("13 Static export", "What the GitHub Pages export publishes",
"""The demo at ma3u.github.io serves no API: the build renames ui/src/app/api/ and the
UI reads a fixture under /mock/ instead. These requests fetch those fixtures and assert
the shape the corresponding endpoint promises, so a fixture that drifts from its
endpoint is caught. `scripts/run-api-tests.sh Static-mock` runs exactly this folder and
needs no stack and no session.""")
_seen = set()
for _r in list(REQS):
    if not _r["mock"]:
        continue
    _endpoint = re.sub(r"^\{\{baseUrl\}\}", "", _r["url"]).split("?")[0]
    _fixture = MOCK.get(_endpoint)
    if not _fixture or _fixture in _seen:
        continue
    _seen.add(_fixture)
    _body = [a for a in _r["asserts"] if not a.startswith("res.status")]
    req(f, _endpoint.replace("/api/", ""), "get", "{{baseUrl}}" + _fixture, persona="anon",
        asserts=["res.status: eq 200"] + _body,
        docs=f"ui/public{_fixture} stands in for {_endpoint} in the static build.")


# ===========================================================================
def display_name(r, seq):
    """The number in a request name is its position in the folder; the emitter
    owns it, so inserting a request never renumbers the rest by hand. The
    connecting-partner folder keeps its own numbering, which groups the API it
    talks to (00 tokens, 10 control plane, 20 hub, 30 issuer, 40 DCP)."""
    base = re.sub(r"^\d+ ", "", r["name"])
    if r["folder"].startswith("10 Connecting partner"):
        return r["name"]
    return f"{seq:02d} {base}"


def emit(r, seq):
    lines = ["meta {", f"  name: {display_name(r, seq)}", "  type: http", f"  seq: {seq}", "}", ""]
    mode = "json" if r["body"] is not None else ("formUrlEncoded" if r["form"] else "none")
    auth = "bearer" if r["bearer"] else "inherit"
    lines += [f"{r['method']} {{", f"  url: {r['url']}", f"  body: {mode}", f"  auth: {auth}", "}", ""]
    headers = dict(r["headers"])
    if r["body"] is not None:
        headers.setdefault("Content-Type", "application/json")
    cookie_var = P[r["persona"]]
    if r["persona"] == "anon":
        headers["Cookie"] = "{{cookieName}}=not-a-session"
    elif cookie_var != "sessionToken":
        headers["Cookie"] = "{{cookieName}}={{%s}}" % cookie_var
    if headers:
        lines += ["headers {"] + [f"  {k}: {v}" for k, v in headers.items()] + ["}", ""]
    if r["bearer"]:
        lines += ["auth:bearer {", f"  token: {{{{{r['bearer']}}}}}", "}", ""]
    if r["body"] is not None:
        lines += ["body:json {"] + ["  " + l for l in json.dumps(r["body"], indent=2,
                                                                 ensure_ascii=False).splitlines()] + ["}", ""]
    if r["form"]:
        lines += ["body:form-urlencoded {"] + [f"  {k}: {v}" for k, v in r["form"].items()] + ["}", ""]
    if r["pre"]:
        lines += ["script:pre-request {"] + ["  " + l if l else "" for l in r["pre"].splitlines()] + ["}", ""]
    if r["asserts"]:
        lines += ["assert {"] + [f"  {a}" for a in r["asserts"]] + ["}", ""]
    if r["tests"]:
        lines += ["tests {"] + ["  " + l if l else "" for l in r["tests"].splitlines()] + ["}", ""]
    if r["docs"]:
        lines += ["docs {"] + ["  " + l if l else "" for l in r["docs"].splitlines()] + ["}", ""]
    return "\n".join(lines).rstrip("\n") + "\n"

def safe(name):
    return (name.replace("/", "-").replace(":", "").replace("?", "")
                .replace("&", "and").replace("'", "").lstrip("-"))

for entry in os.listdir(OUT):
    p = os.path.join(OUT, entry)
    if os.path.isdir(p) and entry not in ("environments", "docs"):
        shutil.rmtree(p)
    elif entry.endswith(".bru") and entry != "collection.bru":
        os.remove(p)

mock_paths = []
for i, (dirname, title, docs) in enumerate(FOLDERS, start=1):
    d = os.path.join(OUT, dirname)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "folder.bru"), "w", encoding="utf-8") as fh:
        fh.write("meta {\n  name: %s\n  seq: %d\n}\n" % (title, i))
        if docs:
            fh.write("\ndocs {\n" + "\n".join("  " + l if l else "" for l in docs.splitlines()) + "\n}\n")
    seq = 0
    for r in [x for x in REQS if x["folder"] == dirname]:
        seq += 1
        fname = safe(display_name(r, seq)) + ".bru"
        with open(os.path.join(d, fname), "w", encoding="utf-8") as fh:
            fh.write(emit(r, seq))
        if dirname.startswith("13 Static export"):
            mock_paths.append(f"{dirname}/{fname}")

with open(os.path.join(OUT, "static-mock.txt"), "w", encoding="utf-8") as fh:
    fh.write("# What scripts/run-api-tests.sh Static-mock runs: the fixtures the GitHub Pages\n"
             "# export actually publishes under /mock/. The export serves no /api/ route at\n"
             "# all, so sending one at it answers 404 (#349).\n"
             "# scripts/check-bruno-coverage.py checks every line still exists.\n")
    for p in mock_paths:
        fh.write(p + "\n")

by_persona = {}
for r in REQS:
    by_persona[r["persona"]] = by_persona.get(r["persona"], 0) + 1
print(f"{len(REQS)} requests in {len(FOLDERS)} folders; {len(mock_paths)} runnable on Static-mock")
print("per persona:", ", ".join(f"{k}={v}" for k, v in sorted(by_persona.items())))
