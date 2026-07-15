# EUDI Wallet Flows — Register · Returning-Login · TK ePA Transfer

**Status:** ✅ Implemented (#81) + extended · **Date:** 2026-06-04 · **Issue:** [#80](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/80)
· **Relates to:** #22, #72, [ADR-028](../ADRs/ADR-028-patient-qr-login-eudi-wallet.md)

> **Update 2026-06-04 (post-#81):** all three flows shipped via #80/#81 with Option (ii).
> Extended since: the **donate slide** now renders the three real data sources Maria
> contributes — **TK ePA**, **Whoop · HealthGraph** (fitness), **Blood Test Oracle** (labs) —
> flowing into the research programs, each gated behind `NEXT_PUBLIC_DEMO_TK` (fictional
> icon tiles + generic labels in the public build). Three personal screenshots
> (`tk-transfer.png`, `whoop-fitness.png`, `bloodtest-labs.png`) are git-ignored (PHI) and
> never committed. Journey E2E click-path locked by **J314–J318** in the static-export spec.

## Phase 2 (2026-06-04) — Interactive QR + approval surfaces

The presentation flows were _animated_ (auto-looping, non-clickable). Phase 2 makes the
wallet approval **interactive** (the user taps Approve) and wires three real entry points,
all static-export safe (client-generated QR via the bundled `qrcode` lib — no verifier
backend needed for the local/GitHub-Pages demo).

| Surface                      | Behaviour                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Homepage** `Register…` CTA | Opens a **modal** ([`RegisterDialog`](../../ui/src/components/RegisterDialog.tsx)) with QR + interactive 3-step wallet → approve → `/patient` |
| **`/auth/eudi-qr`** (static) | Was a dead "unavailable" message → now QR + clickable **Approve/Done**; on approval forwards to `/patient` (the EHR page)                     |
| **`/patient`**               | Personal health record (Fitness · Lab · Nutrition) + **Request EHR data** → QR + TK insurer-app approval → "transferred as FHIR R4"           |

**Shared primitives:**
[`WalletFlow`](../../ui/src/components/wallet/PhoneFrame.tsx) gained an `interactive`/`onComplete`/`onCancel`
mode (the auto-loop presentation usages are untouched; transitional steps can opt into
`auto`-advance). [`EudiApprovalFlow`](../../ui/src/components/wallet/EudiApprovalFlow.tsx) = QR + interactive
wallet. The demo signs the visitor in as `patient1` (sessionStorage + localStorage, per `lib/api.ts`).

### Phase 2 progress

- [x] `WalletFlow` interactive mode (`interactive`/`onComplete`/`onCancel`, `auto` steps); loop usages unchanged
- [x] `EudiApprovalFlow` (client-side `qrcode` QR + interactive wallet; crash-proof in jsdom)
- [x] `RegisterDialog` modal (ESC/backdrop close, `role=dialog`, body-scroll lock, z-[70])
- [x] Homepage `HomeRegisterCta` — Register opens the dialog → approve → `setDemoPersona("patient1")` → `/patient`
- [x] `/auth/eudi-qr` static path: QR + interactive Approve→Done → `/patient` (live polling flow unchanged); `IS_STATIC` read at render-time
- [x] `/patient`: `personalHealth` config (Fitness/Lab/Nutrition, gated), `PersonalHealthCard`, Request-EHR modal → transferred banner
- [x] Unit tests: interactive WalletFlow, EudiApprovalFlow, RegisterDialog, HomeRegisterCta, `personalHealth` fictional default
- [x] E2E **J319–J322** (homepage modal, eudi-qr login, /patient record, Request-EHR) — build-agnostic
- [x] Gates: tsc · eslint (0 errors) · 1742 unit tests pass · coverage 81.9% lines (≥80)
- [x] Verified locally on the `DEMO_TK` static server (`localhost:3000`)

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

- [x] Extract `WalletFlow` engine + `WalletStep` into `ui/src/components/wallet/PhoneFrame.tsx`
- [x] Add `ui/src/components/wallet/flows.tsx` (REGISTER / LOGIN / EHR_TRANSFER steps)
- [x] Reimplement `WalletSimulation.tsx` as a `WalletFlow(REGISTER_STEPS)` shim; existing test green
- [x] Add gated insurer config `ui/src/lib/journey-config.ts` (`NEXT_PUBLIC_DEMO_TK`)
- [x] Add `ui/src/components/wallet/EhrTransferSim.tsx` (renders real TK screenshot under `DEMO_TK`, synthetic fallback)
- [x] `SlideRegister` segmented [First time · Register] / [Returning · Login] control (no new dot)
- [x] `SlideEhr` two-phase + `EhrTransferSim`; config-driven insurer label; fix `EPA` → `ePA`
- [x] `/auth/eudi-qr` `?mode=login|register` (QR / start / poll unchanged)
- [x] Homepage secondary "Already have it? Sign in →" → `/auth/eudi-qr?mode=login`
- [x] `ui/__tests__/unit/components/WalletFlow.test.tsx` (3 flows + fictional-default + donation-sources assertions)
- [x] `.gitignore` `ui/public/journey/tk-transfer.png` (+ `whoop-fitness.png`, `bloodtest-labs.png`); build OK when absent
- [x] `NEXT_PUBLIC_DEMO_TK` exception in `CLAUDE.md` + `.claude/rules/code-style.md`
- [x] Gates: prettier · `tsc -p tsconfig.build.json` · lint · `npm test` (coverage 81.9% lines ≥ 80)
- [x] Verify static-export click-path; journey Playwright spec **J314–J318** added + green
- [x] **(Extension)** Donate slide: 3 real data sources (ePA + Whoop fitness + Blood Test labs), `DataSource` config, `SourceCard`
- [x] (Owner) dropped real `tk-transfer.png` + `whoop-fitness.png` + `bloodtest-labs.png` locally; run live talk with `NEXT_PUBLIC_DEMO_TK=true`

## Open questions — resolved

1. **Real TK screenshot?** ✅ Provided — TK _Behandlungsdaten_ / ePA list (diagnoses, medications,
   billing). Rendered directly in a phone bezel (no synthetic step to match); synthetic
   `EHR_TRANSFER_STEPS` remains the public fallback. Plus Whoop fitness + Blood Test lab panels.
2. **TK brand colour** → **TK blue `#1d3f8a`** (fitness card `#CA6F1E` L4, labs card `#7D3C98` L5).
3. **Where to set `NEXT_PUBLIC_DEMO_TK`** → **local `npm run dev` / local static build only** for the
   talk. The git-ignored PHI screenshots are not in the repo, so the ACA/github.io builds can never
   render them even if the flag were set there — they degrade to the fictional default by construction.
4. **Login CTA** → secondary homepage link + `SlideRegister` segment (no standalone CTA). Shipped.
5. **ePA category list** → Medications · Lab results · Diagnoses/findings · Doctor's letters ·
   Vaccinations. Shipped in `EHR_TRANSFER_STEPS`.
6. **`CLAUDE.md` exception** → filed in-band with #81 (Option (ii) sanctioning note).

## ⚠️ PHI / privacy note (live talk)

The git-ignored screenshots contain real personal health data — the TK ePA shows medications and a
real physician's name (Dr. med. André Wierth). For any **recorded or publicly shared** talk, blur the
physician name and consider redacting specific medications. Local in-person demo is fine.
