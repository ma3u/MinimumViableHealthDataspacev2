# EUDI Wallet Flows — Register · Returning-Login · TK ePA Transfer

**Status:** Planned · **Date:** 2026-06-04 · **Issue:** [#80](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/80)
· **Relates to:** #22, #72, [ADR-028](../ADRs/ADR-028-patient-qr-login-eudi-wallet.md)

Extends the patient [`/journey`](../../ui/src/app/journey/page.tsx) presentation and the
[`WalletSimulation`](../../ui/src/components/WalletSimulation.tsx) with three coherent,
static-export-safe wallet flows that share one phone-frame primitive, and reconciles the
owner's request to name the real **TK Krankenkasse** with the project's fictional-org policy.

## Goal

1. **Register** (new user, first EUDI interaction) — exists; relabel as the "first time" path.
2. **Returning Login** — a deliberately shorter, passwordless approve-and-go flow.
3. **EHR transfer from TK** — pull the patient's **ePA** (elektronische Patientenakte) into the
   portal via **GesundheitsID**, with a TK-branded mobile screen (real screenshot optional).

## Architecture — one shared primitive

Extract the phone chrome from `WalletSimulation` into a generic **`WalletFlow`** engine driven by
a `steps: WalletStep[]` prop (per-step `ms`/`primary`/`accent`, optional `brand`, `loop`). Three
step arrays live in `wallet/flows.ts`. `WalletSimulation` becomes a thin `WalletFlow(REGISTER_STEPS)`
shim → **no call-site churn**, the existing `WalletSimulation.test.tsx` stays green.

| Module                                        | Purpose                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/components/wallet/PhoneFrame.tsx`     | `WalletFlow` engine + `WalletStep` type (keeps `clamp(248px,30vw,288px)`, `rounded-[2rem]`, `border-[5px]`, `#5b3df5` progress, `wsimReveal`) |
| `ui/src/components/wallet/flows.ts`           | `REGISTER_STEPS` (verbatim current copy) · `LOGIN_STEPS` (2-step) · `EHR_TRANSFER_STEPS` (4-step)                                             |
| `ui/src/components/wallet/EhrTransferSim.tsx` | TK-branded wrapper, optional `screenshotSrc`, synthetic fallback                                                                              |
| `ui/src/lib/journey-config.ts`                | Gated insurer config (`NEXT_PUBLIC_DEMO_TK`) — drives slide label + brand chip                                                                |
| `ui/src/components/WalletSimulation.tsx`      | Reimplemented as a `WalletFlow(REGISTER_STEPS)` shim                                                                                          |

## Flows

**A · Register** (3 steps, ≈9.4 s) — trust EHDS (verified org + first-time card) → review PID
selective disclosure → success. On `SlideRegister` + `/auth/eudi-qr?mode=register`.

**B · Login** (2 steps, ≈4.2 s — visibly faster) — "Sign in to EHDS?" with _"You've shared with EHDS
before · last used 14 May"_ (trust step skipped) → "Signed in — welcome back". Surfaced via a
`SlideRegister` segmented control + `/auth/eudi-qr?mode=login` (same QR / `startPresentation` call).

**C · TK EHR transfer** (4 steps) — GesundheitsID auth → choose categories (Medications, Lab
results, Diagnoses/findings, Doctor's letters, Vaccinations; recipient = EHDS portal; purpose;
one-time / until-revoke) → authorising via GesundheitsID → transferred (FHIR R4, E2E-encrypted, TK
cannot read it, revocable). Two-phase reveal inside `SlideEhr` (no new top-level slide); visually
TK-coloured, not EUDI-purple.

## TK / fictional-org reconciliation — **recommend Option (ii)**

`CLAUDE.md` + `.claude/rules/code-style.md` forbid real org names; the owner wants **TK ·
Techniker Krankenkasse** named, with a real TK screenshot, for a live talk. The public site is
indexed on github.io → naming TK there risks trademark/endorsement confusion and breaks the
all-fictional identity.

| Option                                                                                                                          | Trade-off                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (i) Name TK everywhere + disclaimer                                                                                             | Highest authenticity; **violates the rule** on a public, indexable page; disclaimer doesn't remove trademark risk                                                                                      |
| **(ii) Public default fictional (AlphaKasse DE) + `NEXT_PUBLIC_DEMO_TK` flag → TK + real screenshot for the live talk only** ✅ | Public build/repo stay policy-clean (TK never ships); live talk gets full TK credibility; reuses the `NEXT_PUBLIC_STATIC_EXPORT` flag pattern; screenshot git-ignored, component tolerates its absence |
| (iii) TK everywhere permanently                                                                                                 | Permanent rule violation, no compliant fallback                                                                                                                                                        |
| (iv) Generic "your Krankenkasse", no logo                                                                                       | Low risk but still names a real org in committed code and loses the "that's literally my insurer's app" punch                                                                                          |

**Decision (proposed):** Option (ii). Gitignore `ui/public/journey/tk-transfer.png`; add a one-line
sanctioning exception to the fictional-org policy: _real org names (e.g. TK Krankenkasse, gematik)
may appear only behind the `NEXT_PUBLIC_DEMO_TK` build flag for live interoperability demos; the
default build, committed repo, and public github.io site use fictional orgs; real third-party
screenshots are git-ignored and never committed._ Run the talk with `NEXT_PUBLIC_DEMO_TK=true`.

## Technical-accuracy guardrails

- Login speedup is a **wallet-UI** difference (skipped trust step), **not** a protocol/verifier
  difference — the verifier cannot distinguish new vs returning users.
- The TK transfer auth is **GesundheitsID / TK-Ident today**, **not** EUDI Wallet (EUDI→ePA is a
  ~2027–2028 roadmap item). Keep that caveat in copy.
- The insurer is the consent custodian and **cannot read** the E2E-encrypted contents.
- No raw FHIR JSON shown; categories abstracted. Instant transfer + omitted key exchange are
  flagged `simulated`.

## Demo click-path

`Home [Register with EUDI Wallet] → /journey → SlideRegister ([First time · Register] ⇄
[Returning · Login]) → SlideEhr (chips/profile → [Authorize the transfer] → TK sim → "now in
portal") → Donate → Results`. Live aside: `Home [Already have it? Sign in →] →
/auth/eudi-qr?mode=login` (real OpenID4VP on ehds.mabu.red).

## Progress checklist

- [ ] Extract `WalletFlow` engine + `WalletStep` into `ui/src/components/wallet/PhoneFrame.tsx`
- [ ] Add `ui/src/components/wallet/flows.ts` (REGISTER / LOGIN / EHR_TRANSFER steps)
- [ ] Reimplement `WalletSimulation.tsx` as a `WalletFlow(REGISTER_STEPS)` shim; existing test green
- [ ] Add gated insurer config `ui/src/lib/journey-config.ts` (`NEXT_PUBLIC_DEMO_TK`)
- [ ] Add `ui/src/components/wallet/EhrTransferSim.tsx` (optional `screenshotSrc`, synthetic fallback)
- [ ] `SlideRegister` segmented [First time · Register] / [Returning · Login] control (no new dot)
- [ ] `SlideEhr` two-phase + `EhrTransferSim`; config-driven insurer label; fix `EPA` → `ePA`
- [ ] `/auth/eudi-qr` `?mode=login|register` (QR / start / poll unchanged)
- [ ] Homepage secondary "Already have it? Sign in →" → `/auth/eudi-qr?mode=login`
- [ ] `ui/__tests__/unit/components/WalletFlow.test.tsx` (3 flows + fictional-default assertion)
- [ ] `.gitignore` `ui/public/journey/tk-transfer.png`; build OK when absent
- [ ] `NEXT_PUBLIC_DEMO_TK` exception in `CLAUDE.md` + `.claude/rules/code-style.md`
- [ ] Gates: prettier · `tsc -p tsconfig.build.json` · lint · `npm test` (coverage ≥ 80)
- [ ] Verify static-export click-path; re-run journey Playwright spec
- [ ] (Owner) drop real `tk-transfer.png` locally + run live talk with `NEXT_PUBLIC_DEMO_TK=true`

## Open questions (need the owner)

1. Do you have the real **TK screenshot**? What does its consent screen look like (so the synthetic
   step matches)? Drop as `ui/public/journey/tk-transfer.png` (~320–390 px wide).
2. TK brand colour — **TK blue (`#1d3f8a`)** or TK red?
3. Live talk: set `NEXT_PUBLIC_DEMO_TK` on local `npm run dev` only, or also on the ACA app
   (`ehds.mabu.red`, semi-public)?
4. Login as its **own** homepage CTA, or only the secondary link + journey segment? (proposed: latter)
5. Confirm the ePA category list (Medications · Lab results · Diagnoses/findings · Doctor's letters
   · Vaccinations).
6. File the `CLAUDE.md` exception in this PR, or as a separate governance change to approve first?
