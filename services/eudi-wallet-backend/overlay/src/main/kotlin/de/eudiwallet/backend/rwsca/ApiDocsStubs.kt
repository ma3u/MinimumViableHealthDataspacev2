package de.eudiwallet.backend.rwsca

/* See de.eudiwallet.backend.wpb.ApiDocsStubs — same upstream gap, RWSCA package. */

internal const val CHALLENGE_DOCS = "Issues an RWSCA authentication challenge for the Wallet Instance to sign."
internal const val REGISTER_DOCS = "Registers a Wallet Instance with the remote secure cryptographic application."
internal const val INITIALIZE_PIN_AND_START_PIN_SESSION_DOCS =
    "Sets the initial user PIN and opens the first PIN session."
internal const val START_PIN_SESSION_DOCS = "Opens a PIN session, returning a short-lived PIN session token."
internal const val CREATE_KEYS_DOCS = "Creates remote signing keys inside the RWSCA for the calling account."
internal const val SIGN_DATA_DOCS = "Signs the supplied hash with a remote key held by the RWSCA."
internal const val DELETE_ACCOUNT_DOCS = "Deletes the RWSCA account bound to the calling Wallet Instance."

internal const val CHALLENGE_EXAMPLE = "eyJhbGciOiJFUzI1NiJ9.e30.PLACEHOLDER"
internal const val WTE_EXAMPLE = "eyJhbGciOiJFUzI1NiIsInR5cCI6Ind0ZStqd3QifQ.e30.PLACEHOLDER"
internal const val PIN_SESSION_TOKEN_EXAMPLE = "eyJhbGciOiJFUzI1NiJ9.e30.PLACEHOLDER"
internal const val WRAPPED_PRVK_EXAMPLE = "UExBQ0VIT0xERVItV1JBUFBFRC1QUklWQVRFLUtFWQ"
internal const val BASE64_ENCODED_PUBK_EXAMPLE = "UExBQ0VIT0xERVItUFVCTElDLUtFWQ"
internal const val BASE64_ENCODED_HASH_EXAMPLE = "UExBQ0VIT0xERVItU0hBLTI1Ni1IQVNI"
internal const val BASE64_ENCODED_SIGNATURE_EXAMPLE = "UExBQ0VIT0xERVItRUNEU0EtU0lHTkFUVVJF"
internal const val EXAMPLE_INSTANT = "2026-01-01T00:00:00Z"
