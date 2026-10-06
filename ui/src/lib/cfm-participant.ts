/**
 * What the CFM Tenant Manager needs to provision a participant registered at
 * /onboarding: the shape jad/seed-health-tenants.sh sends (#455).
 */

/**
 * The base of the DIDs the EDC layer issues to participants. The same base as
 * jad/seed-health-tenants.sh and scripts/azure/05-cp-participants.sh, so a
 * participant registered here is addressed like the seeded ones (CLAUDE.md,
 * "DID Conventions").
 */
// The host other containers reach IdentityHub's DID endpoint (7083) on: on
// compose identityhub, on Azure mvhd-identityhub (CFM_DID_BASE in
// deploy-azure.yml). A DID on a host that does not exist cannot be resolved,
// and the IssuerService refuses the credential request (#503, 2026-10-06).
const CFM_DID_BASE = process.env.CFM_DID_BASE || "did:web:identityhub%3A7083";

/**
 * The dataspace profile's role names, by EHDS type. Keys are normalised (lower
 * case, hyphens), so "data-holder", "DATA_HOLDER" and "data_holder" agree.
 */
const CFM_ROLE: Record<string, string> = {
  "data-holder": "provider",
  "data-user": "consumer",
  "health-data-access-body": "operator",
  hdab: "operator",
  "hdab-authority": "operator",
};

function cfmRole(ehdsType: string): string {
  return CFM_ROLE[ehdsType.toLowerCase().replace(/_/g, "-")] || "consumer";
}

/**
 * A DID path segment for a display name: ASCII, lower case, hyphens, plus a
 * short random suffix so registering the same name twice gives two DIDs.
 */
export function newDidSlug(displayName: string): string {
  const base = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base || "participant"}-${suffix}`;
}

/** The participant profile the CFM Tenant Manager provisions from. */
export function buildParticipantProfile(
  slug: string,
  displayName: string,
  profileId: string,
  ehdsType: string,
) {
  return {
    identifier: `${CFM_DID_BASE}:${slug}`,
    dataspaceProfileIds: [profileId],
    participantRoles: { [profileId]: [cfmRole(ehdsType)] },
    properties: { displayName, type: slug },
  };
}
