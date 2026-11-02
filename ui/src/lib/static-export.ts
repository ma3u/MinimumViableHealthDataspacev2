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

/**
 * The path the static export is served under, "" on the hub. Next adds it to
 * its own links and assets; a plain <img src> or fetch() of a file in public/
 * adds it itself.
 */
export const BASE_PATH = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
