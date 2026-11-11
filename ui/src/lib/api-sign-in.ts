/**
 * Which role to sign in with for which group of API operations.
 *
 * Shown above both API explorers (components/docs/ApiSignInGuide.tsx) and
 * repeated, in English, in the description of ui/public/openapi.yaml. The
 * groups are the spec's tags. Every route needs a session (ADR-044), and the
 * operator is not a master key: the access body's decisions answer only
 * HDAB_AUTHORITY and a patient's phone and wallet only the PATIENT, so one
 * "sign in as the admin" line would send the reader into a 403.
 *
 * __tests__/unit/lib/api-sign-in.test.ts holds this to the code: each claim
 * below names operations, and the test reads their gate from the route file.
 */
import { DEMO_PERSONAS, type Role } from "@/lib/auth";

export interface ApiSignInRow {
  role: Role;
  /** What the role opens, in English: the key in messages/<lang>/docsDeveloper.json. */
  opens: string;
  /**
   * Operations the row promises, as "METHOD /api/path": each must admit the
   * role. The test fails when a gate moves away from under the sentence.
   */
  admits: string[];
  /** Operations that must refuse EDC_ADMIN, for the rows that say so. */
  refusesOperator?: string[];
}

export const API_SIGN_IN_ROWS: ApiSignInRow[] = [
  {
    role: "EDC_ADMIN",
    opens:
      "Start here. Admin, Participants, Assets, Catalog, Negotiations, Transfers, Trust Center, and every read but a patient's phone and wallet.",
    admits: [
      "GET /api/admin/components",
      "GET /api/admin/tenants",
      "DELETE /api/participants/{id}",
      "POST /api/catalog",
      "GET /api/trust-center",
      "POST /api/compliance/applications",
      "GET /api/patient/profile",
    ],
  },
  {
    role: "HDAB_AUTHORITY",
    opens:
      "Access Body: stop the clock, issue and revoke a permit, open and close a finding, ask for information. Admin: the audit trail, its retention, the policies, the secure processing environments.",
    admits: [
      "POST /api/compliance/permits",
      "POST /api/compliance/permits/revoke",
      "POST /api/compliance/applications/clock",
      "POST /api/compliance/findings",
      "POST /api/compliance/findings/close",
      "POST /api/compliance/information-requests",
      "POST /api/compliance/requests/decide",
      "GET /api/admin/audit",
      "GET /api/admin/audit/retention",
      "GET /api/admin/policies",
      "GET /api/admin/spe",
    ],
    refusesOperator: [
      "POST /api/compliance/permits",
      "POST /api/compliance/permits/revoke",
      "POST /api/compliance/applications/clock",
      "POST /api/compliance/findings",
      "POST /api/compliance/findings/close",
      "POST /api/compliance/information-requests",
      "POST /api/compliance/requests/decide",
    ],
  },
  {
    role: "DATA_USER",
    opens:
      "Access Body: file an application or a data request, publish results. Negotiations, Transfers, Analytics and NLQ as a data user sees them: pseudonyms, and nobody who opted out.",
    admits: [
      "POST /api/compliance/applications",
      "POST /api/compliance/applications/complete",
      "POST /api/compliance/requests",
      "POST /api/compliance/results",
    ],
  },
  {
    role: "DATA_HOLDER",
    opens:
      "Catalog: publish and withdraw a dataset. Access Body: decide a data request.",
    admits: [
      "POST /api/catalog",
      "DELETE /api/catalog",
      "POST /api/compliance/requests/decide",
    ],
  },
  {
    role: "PATIENT",
    opens:
      "Patient: the own record and no other, the opt-out, a consent per programme, the app pairing, the wallet link.",
    admits: [
      "GET /api/patient/profile",
      "GET /api/patient/insights",
      "POST /api/patient/opt-out",
      "POST /api/patient/programmes/consent",
      "POST /api/patient/app-pairing",
      "GET /api/patient/app-devices",
      "GET /api/patient/wallet-link",
    ],
    refusesOperator: [
      "POST /api/patient/app-pairing",
      "GET /api/patient/app-devices",
      "GET /api/patient/wallet-link",
      "PUT /api/patient/profile/interests",
    ],
  },
  {
    role: "TRUST_CENTER_OPERATOR",
    opens:
      "Trust Center. No demo user holds this role: sign in as edcadmin, who may read it.",
    admits: ["GET /api/trust-center"],
  },
];

/**
 * The demo users that hold a role, as the sign-in page lists them. For a role
 * no demo user holds, the operator, who is admitted wherever the table sends
 * the reader for it.
 */
export function demoUsersFor(role: Role): string[] {
  const users = DEMO_PERSONAS.filter((p) =>
    (p.roles as readonly string[]).includes(role),
  ).map((p) => p.username);
  return users.length > 0 ? users : ["edcadmin"];
}
