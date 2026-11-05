/**
 * The fictional organisation behind a participant DID, for display.
 *
 * Two DID forms name the same five organisations (see the DID conventions in
 * .claude/rules/api-conventions.md): the EDC layer's
 * `did:web:identityhub%3A7083:lmc`, whose last segment is the slug, and the
 * graph layer's `did:web:lmc.nl:clinic`, whose last segment is a role
 * (`clinic`, `participant`, `research`, `hdab`) and whose host names the
 * organisation. Reading only the last segment showed "Proveedor: clinic" for
 * every graph-layer row (#876).
 */
const BY_SLUG: Record<string, string> = {
  "alpha-klinik": "AlphaKlinik Berlin",
  pharmaco: "PharmaCo Research AG",
  medreg: "MedReg DE",
  lmc: "Limburg Medical Centre",
  irs: "Institut de Recherche Santé",
};

const BY_HOST: Record<string, string> = {
  "alpha-klinik.de": "AlphaKlinik Berlin",
  "pharmaco.de": "PharmaCo Research AG",
  "medreg.de": "MedReg DE",
  "lmc.nl": "Limburg Medical Centre",
  "irs.fr": "Institut de Recherche Santé",
};

/** Resolve a DID to a short human-readable name */
export function didToName(did: string): string {
  const parts = decodeURIComponent(did).toLowerCase().split(":");
  const slug = parts[parts.length - 1] ?? "";
  if (BY_SLUG[slug]) return BY_SLUG[slug];
  const host = parts[0] === "did" && parts[1] === "web" ? parts[2] ?? "" : "";
  return BY_HOST[host] || slug || did.slice(0, 16);
}
