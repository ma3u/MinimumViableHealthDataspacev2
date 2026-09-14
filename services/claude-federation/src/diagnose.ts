/**
 * Prints the exact values the Console's Connect workload wizard asks for.
 *
 * Registering an issuer needs the `iss` string to match the JWT byte for byte,
 * and Azure has two that differ only in shape: a v1 managed-identity token says
 * `https://sts.windows.net/<tenant>/` while a v2 token says
 * `https://login.microsoftonline.com/<tenant>/v2.0`. Choosing the wrong one
 * fails signature verification with no hint about which value was expected,
 * which is a long way to travel for a trailing slash. This reads the values off
 * a real token instead of guessing.
 *
 *   npm run diagnose
 */
import {
  describeUnverifiedToken,
  entraConfigFromEnv,
  fetchIdentityToken,
} from "./entra.js";

const config = entraConfigFromEnv();
const token = await fetchIdentityToken(config);
const claims = describeUnverifiedToken(token);

console.log(
  "Paste these into Settings -> Workload identity -> Connect workload:\n",
);
console.log(`  Provider          Custom OIDC (or Microsoft Entra ID)`);
console.log(`  Issuer URL        ${claims.issuer ?? "UNREADABLE"}`);
console.log(`  JWKS source       discovery`);
console.log(`  Match audience    ${claims.audience ?? "UNREADABLE"}`);
console.log(`  Token expires at  ${claims.expiresAt ?? "unknown"}`);
console.log("");
console.log("Then set, from what the wizard creates:");
console.log("  ANTHROPIC_FEDERATION_RULE_ID   fdrl_...");
console.log("  ANTHROPIC_ORGANIZATION_ID      the org UUID");
console.log("  ANTHROPIC_SERVICE_ACCOUNT_ID   svac_...");
console.log(
  "  ANTHROPIC_WORKSPACE_ID         wrkspc_...  (only when the rule spans workspaces)",
);
console.log("");
console.log(
  "Match on the audience above, and narrow further with a subject or claim match:\n" +
    "a rule matching only the issuer would accept any workload in the tenant.",
);
