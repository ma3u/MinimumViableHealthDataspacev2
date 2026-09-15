# An operating company for the EHDS

**Status:** discussion paper, written for the closing slide of the Spanish HDAB demo (issue #27).
**Diagram:** [`docs/diagrams/ehds-operating-model.svg`](diagrams/ehds-operating-model.svg)
**Article numbers:** as adopted in Regulation (EU) 2025/327, not as proposed in 2022.
See [`ehds-article-numbering.md`](ehds-article-numbering.md).

## The question

Catena-X did not become a working dataspace when the standards were published. It
became one when somebody was made accountable for running it. The association
writes the rules, Eclipse Tractus-X writes the code, and an operating company
(Cofinity-X, mandate extended to 2028) registers the participants, issues their
identities, operates the core services and answers the phone when an exchange
fails at two in the morning.

EHDS is at the stage Catena-X was at before that third thing existed. The
Regulation is in force, the dates are fixed, and the question nobody has answered
in most Member States is who actually operates the thing.

This paper takes the Catena-X operating model apart and re-cuts it for EHDS. The
short version: EHDS already legislates two of Catena-X's three layers, which
means an operating company for a health dataspace is a **narrower** and **more
constrained** business than Cofinity-X, and the constraint is in the Regulation
itself.

## What Catena-X separates, and what EHDS already fixes

Catena-X keeps three things apart on purpose.

| Layer                    | Catena-X                                    | EHDS                                                                                                           | Free to design?                     |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Rules and governance     | Catena-X Association e.V.                   | EHDS Board (Art. 92, 94), stakeholder forum (Art. 93), steering groups (Art. 95), Commission implementing acts | **No.** Statutory.                  |
| Reference implementation | Eclipse Tractus-X, KITs, INT sandbox        | Nothing equivalent exists                                                                                      | **Yes, and it is the biggest gap.** |
| Operation                | Cofinity-X and the certified provider roles | Undefined below the access body                                                                                | **Yes. This is the opening.**       |

Two consequences fall out immediately.

**The Union layer is closed.** In Catena-X a single Core Service Provider B is
_nominated_ by the association and could in principle be replaced. In EHDS the
equivalent functions belong to the Commission by law: the federated EU dataset
catalogue, the routing of an application that spans several Member States, the
compliance checks for connecting to HealthData@EU, and optionally a central
secure processing environment (Art. 96). No company operates that. Any pitch that
implies otherwise is wrong on the law.

**The national layer is open, and it is where the work is.** Each Member State
designates one or more health data access bodies (Art. 55) and one national
contact point for secondary use (Art. 75(1)), both by **26 March 2027**. The
Regulation says the Member State must give the body "the necessary human,
financial and technical resources", "the necessary expertise" and "the necessary
premises and infrastructure" (Art. 55(2)). It says nothing whatsoever about who
builds or runs any of it.

## The legal hook, and why it is not a workaround

Art. 55(3) is the paragraph that makes an operating company not merely possible
but close to necessary. It obliges Member States to avoid conflicts of interest
inside the access body by segregating its functions, and it names them:

> assessing applications, the reception and preparation of datasets, for example
> pseudonymisation and anonymisation of datasets, and the provision of data in
> secure processing environments

That is a regulator's duty to keep the decision away from the plumbing. It is
also, read the other way, a description of which functions can be industrialised
and shared. The decision cannot be: issuing, refusing and revoking a data permit
(Art. 68), enforcement (Art. 63), and setting fees (Art. 62) are sovereign acts
of a public body. Everything on the other side of the segregation line is
operable by somebody else.

Controllership settles the shape. Under Art. 74 the access body is the controller
for the secondary-use processing. An operating company therefore runs as a
**processor under Art. 28 GDPR**, on documented instructions, with the access
body accountable for it. That is a well-understood construction in every Member
State, it survives a supervisory-authority audit, and it does not require
anything novel in national law.

So the model is:

- The access body **decides** and remains accountable.
- The operating company **operates**, under an Art. 28 agreement, and is measured.
- Enablement services and applications sit **above** the operating company in a
  competitive market, certified, not owned by it.

## The five functions

These are the five the Catena-X experience says matter. Each one below is what it
becomes when the rules are EHDS rather than automotive.

### 1. Planning and roadmap for implementation

Catena-X runs a release train: one major and one minor ecosystem release a year,
two parallel major versions supported for at least twelve months each, a
development gate and a deployment gate, and an integration environment with
synthetic data. EHDS needs the same discipline, but the dates are not the
operator's to choose. They are in Art. 105.

| Date            | What becomes due                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **26 Mar 2027** | Regulation applies. Access bodies and the national contact point designated and notified (Art. 55(6), Art. 75(1)). Templates (Art. 70), SPE requirements (Art. 73(5)), catalogue (Art. 77(4)) and quality-label (Art. 78(6)) implementing acts apply. |
| **26 Mar 2029** | **Chapter IV applies in full.** Permits, data holders' duties, secure processing environments, HealthData@EU for secondary use, all live.                                                                                                             |
| **26 Mar 2031** | The extended data categories in Art. 51(1)(b), (f), (g), (m) and (p). Chapter III for EHR systems already in service.                                                                                                                                 |
| **26 Mar 2035** | Third-country and international-organisation participation in HealthData@EU (Art. 75(5)).                                                                                                                                                             |

A roadmap that works backwards from those dates has an uncomfortable implication
worth saying out loud to a ministry: **2029 is roughly two release years away
once procurement is counted.** The operator's roadmap is therefore not a feature
plan, it is a readiness plan, and its first milestone is a functioning permit
pipeline with one real data holder, not a complete service map.

The operating company owns: the release train and its gates, the versioning and
deprecation policy (Catena-X uses CalVer for the ecosystem and SemVer for
artefacts, which transfers unchanged), a sandbox with synthetic data that
partners can integrate against before they touch anything real, and a published
deprecation window so a hospital's integration is not broken by a release it did
not ask for.

### 2. Coordination with data holders and the onboarding process

This is the function that decides whether the dataspace exists. A permit is
worthless if no holder is connected, and Art. 60 puts real obligations on holders
that most of them currently cannot meet:

- make the data available within **three months** of the access body's request,
  extendable once by three months (Art. 60(2));
- lodge a **dataset description** in the national catalogue (Art. 77) and check
  at least **annually** that it is accurate and up to date (Art. 60(3));
- provide documentation supporting the **data quality and utility label**
  (Art. 78) where one is attached.

And Art. 63(4) gives the access body the power to fine a holder **for each day of
delay** past those three months. A hospital that discovers this in 2029 with no
extraction pipeline is in a bad position. The operating company's job is to make
sure that discovery happens in 2027 instead, at a workshop, not in an enforcement
letter.

The onboarding funnel, with the Catena-X step it corresponds to:

| Step                    | Catena-X                                     | EHDS operating company                                                                           |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1. Identify and qualify | Supplier campaigns, 1U1D visibility rule     | Map who actually holds the Art. 51 categories nationally. Most ministries do not have this list. |
| 2. Register             | Registration service, company data submitted | Registration portal, legal-entity validation against the national register                       |
| 3. Validate identity    | Digital Clearing House, BPN issued           | Verifiable credential issued against an authoritative register, `did:web` identifier             |
| 4. Contract             | Framework agreement, terms accepted          | Art. 28 processing terms, fee split under Art. 62(2), the holder's compensation agreed up front  |
| 5. Connect technically  | Connector registration, technical users      | Connector provisioning, conformance test against the sandbox                                     |
| 6. Describe             | Digital twin registry, submodels             | Dataset description to Art. 77, HealthDCAT-AP, into the national catalogue                       |
| 7. Label                | (no equivalent)                              | Data quality and utility label, Art. 78, with the evidence behind it                             |
| 8. Go live and sustain  | Release compliance                           | Annual description re-check, readiness drills against the three-month clock                      |

Steps 7 and 8 have no Catena-X counterpart and are the ones a ministry tends to
underestimate. Catena-X never had to attach a regulated quality label to a
dataset, and never had to keep thousands of descriptions accurate on an annual
cycle. That is a standing operational load, not a project.

### 3. Definition and delivery of services to the stakeholders

Catena-X publishes a Service Map and sorts every service into Core A (may be
operated several times), Core B (operated once, by the nominated provider),
Enablement (decentralised, run by each participant) and Onboarding. The same
four-way cut works for EHDS, with different contents.

**Onboarding services.** Registration portal, legal-entity validation, credential
issuance, connector provisioning, conformance testing, dataset-description
intake.

**Core services, one set per Member State.** These are the ones the access body
must have and would otherwise build alone:

- the management system recording every application, request, decision and permit
  (Art. 57(1)(e)), which is the operator's system of record;
- the public information system towards natural persons (Art. 58) and the public
  register of applications, permits and refusals, the latter within **30 working
  days** of the decision (Art. 57(1)(j));
- the national dataset catalogue (Art. 77), which must also be exposed to the
  single information points under Regulation (EU) 2022/868 and connect to the
  federated EU catalogue (Art. 79);
- the data quality and utility labelling service (Art. 78);
- the national contact point's gateway into HealthData@EU (Art. 75).

**Secure processing services.** Art. 73 is prescriptive, and it is the hardest
part to run well: access restricted to the natural persons named in the permit,
state-of-the-art prevention of unauthorised copying or removal, unique identities
per user, identifiable access logs kept **at least one year**, download requests
reviewed so that only non-personal or anonymised statistical output leaves, and
**regular audits including by third parties** with corrective action tracked.
Pseudonymisation and anonymisation sit here (Art. 57(1)(b)) but must be
segregated from permit assessment (Art. 55(3)).

This is where confidential computing changes the conversation, and where this
demonstrator already has a design: see
[ADR-037](ADRs/ADR-037-secure-processing-environment-confidential-computing.md).
An access body auditing an SPE today reads the operator's documentation. With
hardware attestation it verifies a measurement of what actually ran, and the
operator is not in the trust path at all. For an operating company that is not a
feature, it is a liability reduction: it is the difference between asking a
regulator to trust you and handing them the means to check.

**Enablement services and applications.** Connectors, FHIR and OMOP pipelines,
analytics runtimes, cohort-discovery tools, HTA and pharmacovigilance
applications. These belong in a competitive market. The single most damaging
thing an operating company can do to its own ecosystem is to compete with the
applications it is supposed to host, and Art. 62's non-discrimination requirement
gives a regulator a lever if it tries.

### 4. Incident management and coordination between the parties

An incident in a health dataspace is almost never inside one organisation. A
failed transfer involves the holder's extraction, a connector at each end, the
operator's catalogue and permit registry, the secure environment, and possibly
the Commission's central platform. Every one of those has a different owner, and
in the absence of a named coordinator each will reasonably conclude the problem
is somewhere else.

The operating company is that coordinator. What it owns:

- **A single point of contact** and one incident record spanning all parties, so
  there is one timeline rather than five.
- **A severity matrix** with the regulatory clocks attached, because in this
  domain severity is legal before it is technical.
- **A major-incident bridge** it can convene, with a standing obligation on
  contracted parties to join.
- **Post-incident review** feeding the release train, so the same failure does
  not recur in the next quarter.

The clocks that make this different from ordinary IT incident management:

| Trigger                                  | Clock                                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal data breach                     | GDPR Art. 33, **72 hours** to the supervisory authority                                                                                                                |
| Health entity, significant incident      | NIS2, early warning in **24 hours**, notification in 72                                                                                                                |
| Data used outside the permit             | Access body notifies the party and may **revoke the permit** and stop processing without undue delay (Art. 63(2), (3)); exclusion of up to **five years** is available |
| Access body finds a possible GDPR breach | Must inform the supervisory authority **immediately** (Art. 63(2))                                                                                                     |
| SPE audit finds a shortcoming            | Corrective action required (Art. 73(3))                                                                                                                                |

The fourth row is the one to dwell on with a regulator. The operating company
does not decide whether a permit-scope incident is a breach. It detects it,
preserves the evidence, and hands it to the access body, which is the controller
and the enforcer. An operator that quietly fixes a scope violation without
telling the body has put the body in breach of Art. 63.

### 5. The support model

Catena-X requires its providers to deliver "first, second and third-level
support" and to publish technical documentation. That tiering transfers, but a
health dataspace needs two things a manufacturing one does not.

**Tiers.**

| Tier  | Owner                            | Scope                                                               |
| ----- | -------------------------------- | ------------------------------------------------------------------- |
| L1    | Operating company                | Single desk, **in the national language**, all services, all actors |
| L2    | Operating company, per service   | Catalogue, permits, onboarding, secure environment                  |
| L3    | Service and technology suppliers | Connector, TEE platform, database, cloud, with contracted response  |
| Cross | Access body                      | Anything that is a decision rather than a defect                    |

**Two functions that are not a ticket queue.**

_Data-holder success._ Hospitals and registries are not customers who raise
tickets when something breaks. They are obligated parties who go quiet when they
are behind. A named contact per holder, a readiness review before the first real
request, and a rehearsal against the three-month clock will do more for
compliance than any amount of L1 capacity. This is the single strongest lesson to
carry over from Catena-X supplier onboarding: the ones who never call are the
risk.

_A researcher desk._ A health data user's first problem is usually not technical.
It is whether the data can answer the question, which variables exist at what
completeness, and whether the cohort is large enough to survive disclosure
control. Answering that before an application is submitted is what keeps the
access body's three-month decision window (Art. 68(4)) from being consumed by
applications that were never going to work. It is also, bluntly, what makes the
dataspace feel usable.

**What to measure.** Not ticket volume. Time from holder request to data
delivered against the Art. 60(2) three months; share of dataset descriptions
re-verified within twelve months; time from permit issue to environment
provisioned; applications withdrawn after a feasibility conversation rather than
refused after three months; and the audit findings from Art. 73(3) closed on
time.

## The money, and why this is not Cofinity-X

Here the analogy breaks, and it is better to say so than to have a ministry
discover it later.

Art. 62 lets the access body and trusted holders charge fees, and then fences
them in. Fees must be **proportionate to the cost** of making data available,
must **not restrict competition**, must be **transparent and non-discriminatory**,
and Member States **may set reduced fees** for public bodies, university
researchers and microenterprises. Part of the fee is passed through to the data
holder to cover its own preparation costs (Art. 62(2)). The Commission will set
principles for fee policies by implementing act (Art. 62(6)). If the parties
cannot agree, the access body sets the fee, and disputes go to the dispute
settlement bodies under the Data Act.

In other words: **cost recovery, audited, with a regulator able to set your
price.** That rules out the venture-scale platform play. What it leaves is a
viable and unglamorous set of forms:

- an **in-house entity** of the access body or the ministry, cheapest on paper
  and slowest to build a delivery culture;
- a **public-private joint venture**, which is what Cofinity-X is and what tends
  to work, with the public side holding the golden share and the private side
  bringing operational discipline;
- a **concession**, competitively tendered for a fixed term against published
  service levels, which suits a Member State that wants contestability.

The commercial upside for private participants is not the operating company. It
is the enablement layer above it: connectors, pipelines, secure-environment
technology, analytics applications. That layer is genuinely open, and keeping the
operating company out of it is what makes it so. Say this plainly to a ministry
and it makes the proposition more credible, not less.

## What EHDS is missing that Catena-X has

Three gaps, worth naming because they are where the next few years of work are.

**No Tractus-X for health.** Catena-X's second layer, an open-source reference
implementation with a vendor-neutral foundation behind it, has no health
equivalent. There are pieces (HL7 Europe and IHE profiles, the TEHDAS2
deliverables, the Commission's own digital testing environment under Art. 40) but
nothing that a Member State can deploy. Every access body is currently at risk of
commissioning its own. A shared implementation is the highest-leverage thing the
Commission or a coalition of Member States could fund, and it is the reason a
working demonstrator is worth showing at all.

**No conformity assessment for operators.** Catena-X certifies operating
companies, providers and solutions through independent assessment bodies. EHDS
has conformity assessment for EHR systems (Chapter III, CE marking, market
surveillance) and nothing for the entity running a secure processing environment
on an access body's behalf. Art. 73(3) requires third-party audits of the
environment but does not define a scheme. Until one exists, an operator should
volunteer to an existing one (ISO 27001, and in Germany BSI C5) rather than wait.

**No standard national architecture.** MyHealth@EU and HealthData@EU are
specified at the border. What happens inside a Member State is unspecified, so
twenty-seven architectures are being drawn in parallel right now. Whoever
publishes a credible national blueprint first will find it widely copied.

## What this demonstrator already shows

The claim at the end of the demo is narrow and true: the operating model above is
not a slide, it is the thing the audience has just watched.

| Operating-company function        | What it maps to here                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Onboarding services               | `/onboarding`, `/credentials` (`did:web`, verifiable credentials, DCP)        |
| National dataset catalogue        | `/catalog`, HealthDCAT-AP over the 5-layer graph, `/data/discover` federated  |
| Permit register and public view   | `/compliance`, `/admin/audit`, `HDABApproval` nodes with cross-border permits |
| Holder data provision             | `/data/share`, `/data/transfer`, FHIR R4 extraction                           |
| Secure processing                 | `/analytics`, `/query`, OMOP aggregates, `SPESession` and ADR-037             |
| Cross-border coordination         | Two access bodies in the seed, a coordination link and a cross-border permit  |
| Incident and enforcement evidence | Audit trail, transfer events, ODRL policy evaluation on every access          |

What it does not show, and should not be claimed: real confidential computing
(phase 1 of ADR-037 is deliberately labelled `simulated: true` in the UI), and a
production-grade support organisation. Those are roadmap, not demo.

## Questions worth putting to the ministry

Ending on questions rather than a proposal tends to work better with a regulator,
and these are the ones whose answers change the design:

1. Will Spain designate one access body or several with a coordinator (Art. 55(1))?
   The answer decides whether the operating company serves one customer or
   federates a group of them.
2. Will the national contact point for secondary use be the coordinator body
   itself, as Art. 75(1) permits, or a separate entity?
3. Does the 2027 designation deadline already have an owner and a budget line?
4. Which holders are in the first wave, and does anyone have the national
   inventory of who holds the Art. 51 categories?
5. In-house, joint venture or concession, and by when does that have to be
   decided to have anything running by March 2029?

## Sources

- Regulation (EU) 2025/327, consolidated text. Article numbers here are the
  adopted ones.
- Catena-X operating model: <https://catenax-ev.github.io/docs/operating-model/why-understanding-the-catena-x-data-space>,
  and the Who, What, How chapters alongside it.
- Cofinity-X as the first Catena-X operating company, mandate extended to 2028.
- [ADR-037](ADRs/ADR-037-secure-processing-environment-confidential-computing.md),
  secure processing environments and confidential computing.
- Issue #27, the Spanish HDAB demo this paper closes.
