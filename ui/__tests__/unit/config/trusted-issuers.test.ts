/**
 * The control plane trusts each issuer for the credential types it may issue
 * (#710, ADR-064). ui/src/content/trusted-issuers.json is the list /compliance
 * shows; docker-compose.jad.yml is what the connector runs with. This keeps
 * the two equal on every PR; TRUST-6.1 in scripts/run-ehds-identity-checks.sh
 * checks the running container the same way.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import trusted from "@/content/trusted-issuers.json";

const ROOT = join(__dirname, "../../../..");
const compose = readFileSync(join(ROOT, "docker-compose.jad.yml"), "utf-8");

/** One service's block of the compose file, up to the next service. */
function service(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  if (start < 0) throw new Error(`no service ${name}`);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** alias -> { id, types } from the control plane's edc.iam.trusted-issuer.* keys. */
const configured: Record<string, { id?: string; types?: string[] }> = {};
for (const m of service("controlplane").matchAll(
  /^\s+edc\.iam\.trusted-issuer\.([^.]+)\.(id|supportedtypes):\s*(.+)$/gm,
)) {
  const value = m[3].trim().replace(/^(['"])(.*)\1$/, "$2");
  configured[m[1]] ??= {};
  if (m[2] === "id") configured[m[1]].id = value;
  else configured[m[1]].types = JSON.parse(value);
}

const onCompose = trusted.issuers.filter((i) =>
  i.environments.includes("compose"),
);

describe("trusted issuers (#710)", () => {
  it("compose trusts exactly the issuers the list names for compose", () => {
    expect(Object.keys(configured).sort()).toEqual(
      onCompose.map((i) => i.alias).sort(),
    );
  });

  it("each with the listed DID and the listed types, never every type", () => {
    for (const issuer of onCompose) {
      const c = configured[issuer.alias];
      expect(c.id, issuer.alias).toBe(issuer.did);
      expect(c.types, issuer.alias).toBeDefined();
      expect([...(c.types ?? [])].sort(), issuer.alias).toEqual(
        [...issuer.types].sort(),
      );
      expect(c.types).not.toContain("*");
    }
  });

  it("trusts the Simpl Governance Authority for membership only (ADR-064)", () => {
    const ga = trusted.issuers.find((i) => i.alias === "simpl-ga");
    expect(ga?.types).toEqual(["MembershipCredential"]);
    expect(ga?.did).toBe("did:web:simpl-ga-issuer%3A10016:simpl-ga");
    expect(ga?.name).toMatch(/fictional/);
  });

  it("runs the authority as its own IssuerService, and the rogue issuer only on demand", () => {
    expect(service("simpl-ga-issuer")).toMatch(
      /edc\.hostname: "simpl-ga-issuer"/,
    );
    expect(service("simpl-ga-issuer")).not.toMatch(/profiles:/);
    expect(service("rogue-issuer")).toMatch(/profiles: \["trust-check"\]/);
    // The rogue issuer is on no list.
    expect(trusted.issuers.map((i) => i.did)).not.toContain(
      "did:web:rogue-issuer%3A10016:rogue",
    );
  });
});
