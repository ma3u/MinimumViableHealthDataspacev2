# ADR-067: A PID links to an account by a keyed fingerprint; the hub stores neither name nor birth date

**Status:** Proposed (2026-10-28)
**Date:** 2026-10-28
**Supersedes:** decision 4 of [ADR-065](ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md) ("a PID opens one record or none", by name, for the two demo personas only)
**Relates to:** [ADR-054](ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md), [ADR-066](ADR-066-the-hub-runs-its-own-eudi-verifier-behind-a-wallet-only-gate.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), #708, #182, #475

## Context

On 2026-10-28 the German wallet d-you presented a real PID to the hub for the
first time, through our own verifier and the SPRIND sandbox registration
(ADR-066). The hub read the name and answered "No record on this hub belongs
to the PID in this wallet": ADR-065 lets a PID open only the record of one of
two fictional personas, Maria Schmidt (`patient1`) and Jan de Vries
(`patient2`), found by name.

A person with a real PID has nowhere to go. The accounts that exist for real
testers are the ones the Klarbefund app creates (ADR-054): a Keycloak user
`kb-xxxxxxxx`, a generated password, an empty sandbox record `KB-XXXXXXXX`.
They sign in by password, at assurance level low. Two things are missing: a
way to link a PID to such an account, and a way to create an account from a
PID.

The maintainer's condition: **the hub must not store a person's name or birth
date.**

### What the law asks, and what it leaves open

- **EHDS (Regulation (EU) 2025/327), Art. 16(1):** a person using the
  electronic health data access services of Art. 4 "shall have the right to
  identify themselves electronically" with any eID means recognised under
  eIDAS Art. 6, the EUDI Wallet included. Member States "may provide
  complementary mechanisms to ensure appropriate identity matching in
  cross-border situations". Art. 16(2) leaves the mechanism to implementing
  acts; Implementing Regulation (EU) 2026/2099 makes the EUDI Wallet that
  mechanism (assurance substantial from 26 March 2027, high from 2030).
  Nothing in the EHDS requires an access service to keep the identity data it
  identified a person with.
- **EHDS Art. 3:** the person accesses _their own_ data. Identification
  therefore has to land on the right record, and only that one.
- **eIDAS (Regulation (EU) No 910/2014 as amended by 2024/1183):**
  - Art. 5b(3): a relying party "shall not request users to provide any data
    other than" its registration names. Asking for the birth date needs a new
    registration certificate.
  - Art. 5a(4)(b): wallets can generate pseudonyms; Art. 5b(9): relying
    parties may not refuse them "where the identification of the user is not
    required". Access to one's own health record requires identification, so
    a pseudonym can link to an account but cannot replace the PID at the
    first link.
  - Art. 11a(2): identity matching needs "a high level of protection of
    personal data" and must "prevent the profiling of users".
- **GDPR:** a fingerprint computed with a secret key is _pseudonymised_ data
  (Art. 4(5)): personal data still (Recital 26), but it reveals neither name
  nor birth date to anyone without the key, which Art. 4(5) requires to be
  kept separately. Data protection by design (Art. 25), minimisation and
  storage limitation (Art. 5(1)(c) and (e)), and erasure (Art. 17) apply. The
  record behind the link is health data (Art. 9); the fingerprint is not.

### What the German PID offers to link on

The German PID, as d-you presents it, carries no persistent personal
identifier the hub could link on (the optional
`personal_administrative_number` is not offered, nor any health insurance
number). What is stable
across re-issuance is the person's data: names and birth date. The holder
key (`cnf`) changes when the PID is re-issued, so it cannot carry a link.
Names alone are not unique; names with the birth date practically are.

## Decision

1. **A PID links to an account by a keyed fingerprint, and the hub stores
   nothing else of it.** The fingerprint is
   `HMAC-SHA256(key, normalise(given_name) | normalise(family_name) | birth_date)`,
   with the normalisation of ADR-065 (case, accents, spaces). Name and birth
   date exist only in memory while the status route computes it, are never
   logged, and are discarded with the sign-in transaction.
2. **The key lives in Key Vault, apart from the data** (ADR-036): secret
   `pid-fingerprint-key`, 256 bits, read by `mvhd-ui` through a Key Vault
   reference. The fingerprint carries a key id, so a rotation is detectable:
   links made under an old key stop matching, and the person links again.
3. **The fingerprint is a Keycloak user attribute**, `pid_fingerprint`, on
   the account it opens. Keycloak is where accounts live; deleting an account
   (`DELETE /api/patient/app/account`, Art. 17) deletes the link with it.
   One fingerprint belongs to at most one account.
4. **The hub asks for the birth date, to compute the fingerprint and for
   nothing else.** A new registration certificate in the SPRIND registrar
   names `family_name`, `given_name` and `birth_date`; the purpose says why
   and that none of them is stored. The DCQL query follows the registration
   (Art. 5b(3)).
5. **Three flows.**
   - **Link:** a signed-in patient (a `kb-` account, by password) opens
     "Connect your EUDI wallet", presents the PID, and the fingerprint is
     written to their own account. Refused when it already belongs to another
     account.
   - **Sign in:** a PID whose fingerprint is on an account signs in as that
     account, at assurance level high.
   - **Register:** a PID whose fingerprint is on no account may create one: a
     `kb-` account with an empty sandbox record, as ADR-054 makes them, with
     the fingerprint on it. The verified PID takes the place of App Attest
     as the guard: one account per fingerprint, behind the same rate limit.
6. **The two demo personas stay as they are.** Maria Schmidt and Jan de Vries
   keep their name match (ADR-065), so a test PID from an issuer still opens
   a synthetic record. A real person never matches them unless they share
   the name; with the birth date in the fingerprint, a link to one of them is
   no longer possible by accident.
7. **Unlinking** is a button on the same page and removes the attribute.

## Consequences

- A person with a real PID can sign in to an account of their own, and a
  Klarbefund tester can reach their app account from the website at
  assurance high.
- The hub holds, per linked account, one HMAC value. Without the key it says
  nothing; with the key it confirms a guessed name and birth date, which is
  why the key is kept in Key Vault only and never next to Keycloak's database.
  This is pseudonymised personal data, and the privacy notice
  (`ui/public/hub/privacy.html`) must say so: what is kept, why, on which
  basis (consent, given when linking), and how to remove it.
- The registration certificate changes, and with it the text d-you shows. The
  old certificate is revoked in the registrar once the new one is live.
- Keycloak 26's declarative user profile must allow the attribute (declared,
  admin-only, not shown to the user), and the account service needs to read
  users to find a fingerprint (`view-users` on top of `manage-users`).
- Key rotation breaks every link until the person links again. Acceptable for
  a sandbox; a production service would version the key and re-link on the
  next sign-in.
- Two people with the same name and birth date would share a fingerprint. The
  second one to link is refused and told why.
- This is not the cross-border identity matching of EHDS Art. 16(1) or eIDAS
  Art. 11a, which belongs to Member States. A national deployment would match
  on the national patient index; the hub has none.

## Alternatives rejected

- **Store name and birth date in clear.** The maintainer's condition, and
  unnecessary for the purpose (GDPR Art. 5(1)(c)).
- **Fingerprint of the name only.** No new registration, but not unique, and
  a small dictionary: anyone with the key confirms a name instantly.
- **The PID's holder key (`cnf`).** Changes when the PID is re-issued, so a
  person would lose their account.
- **A wallet pseudonym only** (eIDAS Art. 5a(4)(b)). Ideal for later sign-ins,
  but the first link must identify the person (EHDS Art. 16, Art. 3), and
  whether d-you offers pseudonyms to relying parties is not known yet.
  Revisit when it does: a pseudonym bound at link time would let later
  sign-ins skip the PID.
- **Issue the account to the wallet as an attestation (EAA).** Nothing stored
  on the hub at all, but it makes the hub an attestation issuer with its own
  registration and rulebook. Out of scope for a sandbox.
