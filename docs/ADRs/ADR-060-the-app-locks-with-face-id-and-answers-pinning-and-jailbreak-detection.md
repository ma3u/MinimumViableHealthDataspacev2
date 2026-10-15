# ADR-060: The app locks with Face ID or the passcode; certificate pinning and jailbreak detection are declined with reasons

## Status

Accepted, 2026-10-15. Closes the "decide" items of
`docs/security/threat-model-klarbefund.md` and finding F9 of
`docs/security/security-test-report-2026-10-15.md` (#655).

## Context

BSI TR-03161 part 1 asks a health app three things the self-assessment
(`docs/klarbefund/self-assessment.md`) had left open: an authentication in
front of the data (O.Auth), resilience against a tampered platform (O.Resi)
and a network layer that does not trust the system's certificate store
alone (O.Ntwk). The threat model's residual risks said "decide: implement
or document why the device lock, ATS and App Attest are sufficient". This
record decides all three.

## Decision

1. **App lock, implemented, on by default.** When the app comes to the
   front it asks for Face ID or Touch ID, with the passcode as the system's
   own fallback (`LAContext`, `deviceOwnerAuthentication`), before the cover
   lifts. The rule for _when_ a challenge is due is a pure
   `AppLockPolicy` in the Shared module, tested without a device; the
   default is every return from the background. A person can switch it off
   in Settings; the footer says what that means. A phone without a passcode
   has nothing to check against, and the lock opens, which is the posture
   the device itself has. The Face ID usage string is in `project.yml` and
   translated.
2. **Certificate pinning, declined.** The app talks to two hosts the person
   chose or confirmed (the hub, the explanation service), over TLS that
   App Transport Security enforces against the system trust store, with no
   exception domain. Pinning would protect against a compromised or
   coerced certificate authority, at the price of an app update on every
   certificate rotation and a dead app when one is missed; the hub rotates
   through a managed certificate. For a personal-use app whose data the
   person already holds locally, the trade favours ATS. Revisit if the app
   ever carries a credential more valuable than the person's own record.
3. **Jailbreak and debugger detection, declined.** Every known check is
   bypassable on a jailbroken device and most produce false positives on
   developer devices; a warning the attacker controls is not a control. The
   data is sealed per record under a key the Secure Enclave protects while
   the phone is locked, which is the protection that still holds on a
   jailbroken but locked phone. App Attest proves a genuine app to the hub,
   so a tampered build cannot create accounts or push data there. That is
   where integrity matters for someone other than the phone's owner.

## Consequences

- O.Auth becomes "met" in the self-assessment; O.Ntwk and O.Resi stay
  "partly" and "open" respectively, now with a documented reason, which is
  what a TR-03161 gap analysis needs.
- `SecurityPostureTests` pins the default and the authentication policy.
- The simulator cannot evaluate biometrics; the UI test launches with the
  lock switched off, and a device test is the manual check.
- A phone handed over unlocked no longer shows the results.

## Alternatives considered

- **An in-app PIN.** A second secret to forget, weaker than the device's,
  and TR-03161 prefers the platform mechanism.
- **Locking only after a grace period.** Convenient, but the policy
  supports it and the default stays strict; an operator can relax it.
- **Pinning with a bundled backup key.** Halves the rotation risk and keeps
  the rest; still declined for the reasons above.
