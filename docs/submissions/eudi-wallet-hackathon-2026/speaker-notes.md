# Speaker notes — Consent Wallet for the EHDS (3-minute pitch)

> Companion to `EUDI-Consent-Wallet-Pitch.pdf`. Built from a 4-persona jury panel
> (SPRIND innovation · BSI/eIDAS security · EHDS health-policy · pitch coach) and an
> adversarial regulatory fact-check. **Read the "Q&A defense crib" before you go on stage —
> it is where pitches in this room are won or lost.**

## The one-line story

> **EHDS lets researchers reuse health data on a Health-Data-Access-Body permit, with a
> citizen right to opt out — but ships no standard, citizen-held channel to exercise that
> choice. The EUDI Wallet is that channel: opt out (or consent where the law requires),
> verifiably, withdrawably, with no central registry.**

## 3-minute timing plan (hold slide 8 in reserve)

| Time      | Slide     | Beat           | Do                                                                                      |
| --------- | --------- | -------------- | --------------------------------------------------------------------------------------- |
| 0:00–0:35 | Title + 1 | **Cold open**  | Play the 15–20s recorded clip: Lena opts out → gate flips to DENIED. Say the one-liner. |
| 0:35–1:00 | 2         | **The gap**    | Permit + opt-out exists in law; the citizen-held channel does not.                      |
| 1:00–1:20 | 3         | **Use case**   | One sentence + the wallet card with selective disclosure.                               |
| 1:20–2:00 | 4         | **Demo**       | grant → govern → withdraw, on the real governance gate.                                 |
| 2:00–2:20 | 5         | **Why us**     | A running EHDS stack, not a 48h mockup.                                                 |
| 2:20–2:40 | 6         | **Regulation** | Map each feature to its exact anchor; be honest about scope.                            |
| 2:40–3:00 | 7         | **Ask**        | Shortlist for EUDI ON; co-develop the schema; SPRIND/BSI input.                         |
| —         | 8         | **Reserve**    | "What's next" — only if asked / time remains.                                           |

Rehearse with a stopwatch. If anything slips, drop slide 5 to one sentence, not the demo.

## Per-slide notes

**Title / 1 — Watch my phone, not a slide.** Don't read. Start the recorded revoke clip;
re-perform live only if the room is with you and the network cooperates. "That's the whole
pitch — the citizen's secondary-use choice as a wallet-held, verifiable, withdrawable trust
primitive. No central registry. Synthetic data, standard eIDAS and EHDS protocols."

**2 — The regulation ships a gap.** EHDS Chapter IV: reuse on an HDAB permit, with a citizen
opt-out at any time, no reason needed (this goes _beyond_ GDPR Art. 21). EHDS even mandates an
"accessible, easily understandable opt-out mechanism" — but no standard for it. eIDAS 2.0 ships
the wallet. The missing piece is the citizen-held channel. The fallback is a central opt-out
registry — a honeypot.

**3 — The use case, in one sentence.** The wallet becomes the citizen's channel to exercise
their EHDS rights: opt out by default, consent where the law requires, withdraw any time.
Keycloak issues it as a verifiable SD-JWT attestation (ES256). Selective disclosure: researcher
sees a pseudonym, never the name — data minimisation by construction.

**4 — Live demo: grant → govern → withdraw.** Three beats, all synthetic. (1) Lena gets a PID,
presents at the portal, the attestation lands in her wallet. (2) MedReg DE (HDAB) issues
PharmaCo's permit; Lena hasn't opted out → gate approves. (3) Lena opts out → we record it,
auditable + timestamped → re-run the same gate → DENIED. The choice is authoritative at the
access boundary: re-checked per query, **never deleted**.

**5 — Why us: regulation, running.** Most teams would spend 48h building the backend. We have
it: a 5-layer EHDS reference stack, the HDAB permit flow, DCP machine trust, ODRL policies. The
Keycloak OID4VCI bridge issues the attestation into the wallet today; presentation runs through
the hosted EUDI reference verifier.

**6 — Regulation & privacy-by-design.** eIDAS → the attestation + selective disclosure. EHDS
Ch. IV → HDAB permit + opt-out honoured at the gate. GDPR → HDAB assesses the Art. 6 basis;
Art. 7(3) is the withdrawal where consent applies. Honest scope: enforced at the access boundary
today; cryptographic status-list is roadmap.

**7 — Impact + the ask.** Trust is what slows EHDS secondary use; citizen-held revocable opt-out
rebuilds it. Three asks: shortlist for EUDI ON (live demo); co-develop the preference-attestation
schema as a reusable EHDS EAA with HDABs; SPRIND/BSI input on in-wallet opt-out as a trust
primitive. "From honeypot to handset."

**8 — What's next (reserve).** Dynamic per-study scope; IETF Token Status List (draft) for
cryptographic revocation; self-hosted verifier; SPRIND-sandbox PID conformance; a pilot with a
fictional HDAB on synthetic cohorts.

## Q&A defense crib (the jury _will_ probe these)

**Q: EHDS secondary use is opt-out + permit, not consent. Why "Consent Wallet"?**
You're exactly right — and that's our point. Secondary use runs on the HDAB permit with a citizen
opt-out, no reason needed. The wallet carries the citizen's choice: opt-out by default, and
_explicit consent where the law does require it_ (e.g. genetic data, non-pseudonymised data, or
Member-State-specific rules). "Consent Wallet" is the friendly name; technically it is a
verifiable opt-out/consent channel. The HDAB still issues the permit and assesses the GDPR Art. 6
basis — we don't claim the wallet is the legal basis.

**Q: Does the wallet cryptographically revoke the credential?**
No — and we're deliberate about that. The credential is a short-lived SD-JWT with no status list
today. Revocation is enforced at the **access boundary**: the opt-out flips an auditable,
timestamped record and the governance gate re-checks per query. We chose this because it is
auditable (GDPR Art. 7(3) / EHDS audit trail) and doesn't force every verifier to poll a status
endpoint. Cryptographic revocation via the IETF Token Status List (a draft) is on the roadmap.

**Q: Is the OID4VP verifier yours?**
We present via the hosted EUDI reference verifier — the known-good path. A self-hosted verifier is
roadmap; we didn't reinvent the verifier in 48 hours.

**Q: Is the consent scope dynamic / per study?**
Today it's a fixed schema — one purpose, one study — demonstrated end-to-end. Dynamic,
citizen-selected per-study scope is the next step. Our standardisation ask is about the _schema_
(`consent_purpose`, `consent_scope`, opt-out), not today's hardcoded values.

**Q: Is this real patient data?**
All synthetic — 127 patients, 5,300+ graph nodes. All orgs fictional: AlphaKlinik Berlin (clinic),
PharmaCo Research AG (researcher), MedReg DE (HDAB).

**Q: Do you talk to the SPRIND / EUDI sandbox?**
We issue via the hosted EUDI reference issuer as the reliable path. SPRIND-sandbox PID conformance
is a roadmap item, not yet achieved — and Keycloak's OID4VCI is experimental, so we de-risk by
pre-staging issuance against the reference issuer.

**Q: Delete or withdraw?**
We never delete consent — we mark it withdrawn with a timestamp. Auditable and GDPR-correct.

## What's real vs roadmap (say this out loud if pressed)

| Built today                                                                | Roadmap                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Keycloak OID4VCI bridge → SD-JWT attestation into the EUDI wallet          | Cryptographic revocation (IETF Token Status List, draft) |
| 5-layer EHDS graph, HDAB permit flow, DCP, ODRL, contract/transfer chain   | Dynamic, citizen-selected per-study scope                |
| Auditable in-graph withdrawal + governance re-check at the access boundary | Self-hosted OID4VP verifier                              |
| Selective disclosure (pseudonym, not name) via dc+sd-jwt / ES256           | SPRIND-sandbox PID conformance                           |
| EUDI iOS reference wallet running in simulator                             | Pilot with a fictional HDAB on synthetic cohorts         |

## Demo de-risking checklist

- [ ] Record a clean 15–20s capture of grant → gate → withdraw — this is the **primary** artifact.
- [ ] Pre-stage issuance against the hosted reference issuer; presentation against the hosted verifier.
- [ ] Have still screenshots (`img/`) as a fallback if the network drops.
- [ ] Name the three fictional orgs out loud once, early, mapped to their roles.
- [ ] Rehearse to 3:00 with a stopwatch; land the withdraw moment by ~2:00.
- [ ] Never let an unverified sandbox step be a single point of failure on stage.
