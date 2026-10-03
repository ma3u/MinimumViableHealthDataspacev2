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
const CFM_DID_BASE = process.env.CFM_DID_BASE || "did:web:identityhub%3A7083";

/** The dataspace profile's role names, by the EHDS type the form sends. */
const CFM_ROLE: Record<string, string> = {
  "data-holder": "provider",
  "data-user": "consumer",
  "health-data-access-body": "operator",
};

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
    participantRoles: { [profileId]: [CFM_ROLE[ehdsType] || "consumer"] },
    properties: { displayName, type: slug },
  };
}
