/**
 * True in the GitHub Pages build (NEXT_PUBLIC_STATIC_EXPORT=true), where the
 * API routes do not exist and fetchApi() serves /mock/*.json instead. Next
 * inlines NEXT_PUBLIC_* at build time, so this is a constant per bundle.
 *
 * Read once at module load. Code that a test flips with vi.stubEnv without
 * reloading the module (fetchApi, the EUDI QR page) reads the variable at
 * call time instead.
 */
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
