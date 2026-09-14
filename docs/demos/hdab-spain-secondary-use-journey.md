# EHDS secondary use, step by step

A 30-minute walkthrough of the journey in [`docs/userjourney.drawio`](../userjourney.drawio),
for the Spanish HDAB regulator demo ([issue #27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27)).

**Every step below is a link you can paste.** No sign-in, no Keycloak, no
cluster. The links point at the GitHub Pages mirror, which serves the same UI
against fixed fixtures, so the demo behaves identically whether or not the
Azure deployment is healthy on the day.

If the live deployment is up and you would rather show it, swap the host for
`https://ehds.mabu.red` and sign in with the credentials at the bottom. The
paths are the same.

> **Until this branch is merged and Pages redeploys**, `?persona=` is ignored
> on the live mirror: the pages all load, but each one shows the signed-out
> navigation. Until then, open
> [/demo](https://ma3u.github.io/MinimumViableHealthDataspacev2/demo) first,
> click the persona card for the step you are on, and then use the links below.
> Check with `J882` in the spec at the bottom of this page: when it passes
> against `https://ma3u.github.io`, the deep links are live and this note can
> go.

## Before you start

1. Open the links in **one tab, in order**. The persona is stored per tab, and
   each link carries its own `?persona=`, so going back a step is safe.
2. Do not add a trailing slash. `/graph` works, `/graph/` is a 404: the export
   is built with `trailingSlash: false`.
3. Have the diagram open next to the browser. The step numbers below are the
   numbers in the diagram.

## The journey

The story: a hospital publishes a dataset, a researcher finds it and asks for
it, the HDAB grants a permit, pseudonymised data moves into a secure processing
environment, the researcher analyses it and publishes results, and the HDAB
gets an audit trail of the whole thing.

### 1. Registration and trust

Three parties join the dataspace and get verifiable credentials. Nobody can
publish, request or approve anything before this.

| Step | Who                        | Link                                                                                                             |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1a   | Hospital registers         | [/onboarding as hospital](https://ma3u.github.io/MinimumViableHealthDataspacev2/onboarding?persona=hospital)     |
| 1b   | Researcher registers       | [/onboarding as researcher](https://ma3u.github.io/MinimumViableHealthDataspacev2/onboarding?persona=researcher) |
| 1c   | HDAB registers             | [/onboarding as HDAB](https://ma3u.github.io/MinimumViableHealthDataspacev2/onboarding?persona=hdab)             |
| 1    | The credentials themselves | [/credentials](https://ma3u.github.io/MinimumViableHealthDataspacev2/credentials?persona=hdab)                   |

**Say:** each participant has a `did:web` identity and a verifiable credential
issued against it. Membership is attested, not configured. This is the DCP
layer, and it is what makes the later steps refusable rather than merely
logged.

**Point at:** the participant DIDs. `did:web:alpha-klinik.de:participant`,
`did:web:pharmaco.de:research`, `did:web:medreg.de:hdab`.

### 2. The hospital publishes a dataset

| Link                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ |
| [/data/share as hospital](https://ma3u.github.io/MinimumViableHealthDataspacev2/data/share?persona=hospital) |
| [/catalog](https://ma3u.github.io/MinimumViableHealthDataspacev2/catalog?persona=hospital)                   |

**Say:** the dataset is described in HealthDCAT-AP 2.1, not a bespoke schema,
and it carries an ODRL policy that says who may do what with it. The catalogue
entry is metadata only. No patient data has moved, and none will until a permit
exists.

**Point at:** the ODRL policy on the data product, and `conformsTo` on the
distribution.

### 3. The researcher discovers it

| Link                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- |
| [/data/discover as researcher](https://ma3u.github.io/MinimumViableHealthDataspacev2/data/discover?persona=researcher) |

**Say:** discovery is federated. The researcher queries a catalogue that spans
participants in more than one member state, which is Article 14 territory:
cross-border discovery without cross-border data movement.

### 4. Contract negotiation

| Link                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- |
| [/negotiate as researcher](https://ma3u.github.io/MinimumViableHealthDataspacev2/negotiate?persona=researcher) |

**Say:** this is the Dataspace Protocol state machine, offer to agreement, and
it is a real negotiation with states, not a download button. Note that an
agreement here still does not release data.

**Point at:** the negotiation states and the resulting contract agreement id.

### 4b. The HDAB approves the data permit

| Link                                                                                                 |
| ---------------------------------------------------------------------------------------------------- |
| [/compliance as HDAB](https://ma3u.github.io/MinimumViableHealthDataspacev2/compliance?persona=hdab) |

**Say:** this is the control the regulator in the room actually cares about.
EHDS Articles 46 to 53. A contract between two participants is not sufficient;
the access body issues a permit, and the permit is what unlocks the transfer.
Two independent gates, and the regulator holds one of them.

**Expect the question:** "what happens if we refuse?" Answer: step 5 cannot
start. The permit is a precondition of the transfer, not a record of it.

### 5. Extract and upload, pseudonymised

| Link                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ |
| [/data/transfer as hospital](https://ma3u.github.io/MinimumViableHealthDataspacev2/data/transfer?persona=hospital) |

**Say:** the hospital extracts FHIR R4 resources and pseudonymises them before
they leave. The researcher never receives direct identifiers. Re-identification
is possible only through the Trust Center, and only for a named authority.

### 6. Analysis in the secure processing environment

| Link                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- |
| [/analytics as researcher](https://ma3u.github.io/MinimumViableHealthDataspacev2/analytics?persona=researcher) |
| [/query as researcher](https://ma3u.github.io/MinimumViableHealthDataspacev2/query?persona=researcher)         |

**Say:** analysis happens where the data is, in an OMOP CDM 5.4 shape. The
researcher gets cohort counts and aggregates out; the row-level data does not
leave the environment. This is the shape of Article 50.

### 7. Results

| Link                                                                                                   |
| ------------------------------------------------------------------------------------------------------ |
| [/tasks as researcher](https://ma3u.github.io/MinimumViableHealthDataspacev2/tasks?persona=researcher) |

**Say:** what leaves the environment is aggregate output, and it leaves under
the same policy that governed the input.

### 8. The audit report

| Link                                                                                                   |
| ------------------------------------------------------------------------------------------------------ |
| [/admin/audit as HDAB](https://ma3u.github.io/MinimumViableHealthDataspacev2/admin/audit?persona=hdab) |

**Say:** every step above left a record: who asked, who approved, what moved,
when, under which contract and which permit. The regulator can reconstruct the
chain without asking either participant for their logs.

**Close on this.** It is the answer to "how would we supervise this".

## Two extras worth keeping in your pocket

| What               | Link                                                                                                 | When to use it                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| The 5-layer graph  | [/graph](https://ma3u.github.io/MinimumViableHealthDataspacev2/graph?persona=hdab)                   | Opening context, or when someone asks how the layers relate   |
| Protocol scorecard | [/compliance/tck](https://ma3u.github.io/MinimumViableHealthDataspacev2/compliance/tck?persona=hdab) | When asked "is this really DSP, or your interpretation of it" |

The scorecard shows DSP and DCP rows skipped on the hosted mirror. Say so
plainly: those run against a local EDC stack, per ADR-022, and the EHDS rows
are green. Do not let it look like a pass that is hiding something.

## Personas

`?persona=` accepts either the persona id or the username, so both of these
land on the same view: `?persona=hdab` and `?persona=regulator`.

| Persona id   | Username     | Organisation                 | Role           |
| ------------ | ------------ | ---------------------------- | -------------- |
| `hospital`   | `clinicuser` | AlphaKlinik Berlin           | DATA_HOLDER    |
| `hospital`   | `lmcuser`    | Limburg Medical Centre       | DATA_HOLDER    |
| `researcher` | `researcher` | PharmaCo Research AG         | DATA_USER      |
| `hdab`       | `regulator`  | MedReg DE                    | HDAB_AUTHORITY |
| `edc-admin`  | `edcadmin`   | Dataspace Operator           | EDC_ADMIN      |
| `patient`    | `patient1`   | AlphaKlinik Berlin (patient) | PATIENT        |

On the live deployment the password equals the username, in the `edcv` realm.
On the Pages mirror there is no password, because there is no sign-in.

## If something misbehaves

| Symptom                            | What to do                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| A link 404s                        | Check for a trailing slash. That is almost always it.                     |
| Navigation shows the wrong role    | The persona is per tab. Re-open the step link, which carries `?persona=`. |
| A table is empty                   | Reload once. The page fetches its fixture client-side.                    |
| The live site will not sign you in | Use these Pages links. They need nothing from the cluster.                |

## Keeping this honest

`ui/__tests__/e2e/journeys/37-ehds-secondary-use-journey.spec.ts` walks every
link on this page and asserts that each one resolves, renders its own content,
and applies the right persona. It also fails if any link here grows a trailing
slash.

```bash
cd ui
NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=https://ma3u.github.io \
  npx playwright test 37-ehds-secondary-use-journey.spec.ts --project=chromium
```

Run it the morning of the demo.
