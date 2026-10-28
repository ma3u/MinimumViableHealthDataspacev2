package de.eudiwallet.backend.mdvm

/* See de.eudiwallet.backend.wpb.ApiDocsStubs — same upstream gap, MDVM package. */

internal const val CHALLENGE_DOCS = "Issues an MDVM authentication challenge for the Wallet Instance to sign."
internal const val ANDROID_REGISTER_DOCS = "Registers an Android device after Play Integrity and key attestation."
internal const val ANDROID_RENEWAL_DOCS = "Renews the MDVM token of a registered Android device."
internal const val IOS_REGISTER_DOCS = "Registers an iOS device after App Attest attestation."
internal const val IOA_RENEWAL_DOCS = "Renews the MDVM token of a registered iOS device."
internal const val DELETE_ACCOUNT_DOCS = "Deletes the device account bound to the calling Wallet Instance."

internal const val MDVM_AUTH_CHALLENGE_EXAMPLE = "eyJhbGciOiJFUzI1NiJ9.e30.PLACEHOLDER"
internal const val MDVM_TOKEN_EXAMPLE = "eyJhbGciOiJFUzI1NiIsInR5cCI6Im1kdm0rand0In0.e30.PLACEHOLDER"
internal const val ANDROID_DEVICE_INFO_EXAMPLE = """{"model":"Placeholder","osVersion":"14.0.0"}"""
internal const val ANDROID_KEY_ATTESTATION_EXAMPLE = "UExBQ0VIT0xERVItQU5EUk9JRC1LRVktQVRURVNUQVRJT04"
internal const val IOS_DEVICE_INFO_EXAMPLE = """{"model":"Placeholder","osVersion":"18.0"}"""
internal const val DEVICECHECK_ATTESTATION_EXAMPLE = "UExBQ0VIT0xERVItQVBQLUFUVEVTVC1BVFRFU1RBVElPTg"
internal const val DEVICECHECK_ASSERTION_EXAMPLE = "UExBQ0VIT0xERVItQVBQLUFUVEVTVC1BU1NFUlRJT04"
internal const val EXAMPLE_INSTANT = "2026-01-01T00:00:00Z"
