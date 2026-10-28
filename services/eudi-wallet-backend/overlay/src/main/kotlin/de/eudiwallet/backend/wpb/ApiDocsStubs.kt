package de.eudiwallet.backend.wpb

/*
 * The published mirror uses these OpenAPI description/example constants in `WpbApi.kt`
 * but does not ship the file that declares them, so `src/main/kotlin` does not compile
 * on its own. They are annotation arguments only — swagger prose and example payloads —
 * so substituting them changes the generated OpenAPI document and nothing else.
 *
 * Upstream gap, not a fork: delete this file the moment the mirror ships the originals.
 * See docs/planning/current/issue-182-german-national-wallet-integration.md (W1).
 */

internal const val CHALLENGE_DOCS = "Issues a WPB authentication challenge for the Wallet Instance to sign."
internal const val REGISTER_DOCS = "Registers a Wallet Instance with the Wallet Provider Backend."
internal const val REVOKE_DOCS = "Revokes a Wallet Instance using its revocation code."
internal const val ATTESTATION_DOCS = "Issues a Wallet Instance Attestation (WIA) to a registered Wallet Instance."
internal const val DELETE_ACCOUNT_DOCS = "Deletes the WPB account bound to the calling Wallet Instance."

internal const val CHALLENGE_EXAMPLE = "eyJhbGciOiJFUzI1NiJ9.e30.PLACEHOLDER"
internal const val WIA_EXAMPLE = "eyJhbGciOiJFUzI1NiIsInR5cCI6Ind3dy1qd3QifQ.e30.PLACEHOLDER"
internal const val REVOCATION_CODE_EXAMPLE = "00000000-0000-0000-0000-000000000000"
