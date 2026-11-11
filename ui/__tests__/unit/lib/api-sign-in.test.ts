/**
 * The table above the API explorers says which demo user to sign in as for
 * which group of operations (lib/api-sign-in.ts). Each row names operations;
 * this reads their gate from the route file, so a sentence cannot outlive the
 * requireAuth() call it describes. It also holds the demo users to the realm
 * and the row texts to the dictionaries (they reach t() as a variable, which
 * the i18n test's search for t("...") literals cannot see).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { API_SIGN_IN_ROWS, demoUsersFor } from "@/lib/api-sign-in";
import { SPE_POWER_ROLES } from "@/lib/spe-power";
import { MESSAGES } from "@/messages";

const UI = path.resolve(__dirname, "../../..");
const API_DIR = path.join(UI, "src/app/api");
const CONSTANTS: Record<string, string[]> = { SPE_POWER_ROLES };

/** The roles a requireAuth() argument list admits; null is any session. */
function rolesOf(args: string): string[] | null {
  const a = args.trim();
  if (!a) return null;
  if (a in CONSTANTS) return CONSTANTS[a];
  return [
    ...[...a.matchAll(/"(\w+)"/g)].map((m) => m[1]),
    ...[...a.matchAll(/Roles\.(\w+)/g)].map((m) => m[1]),
  ];
}

/** The gate of "METHOD /api/path": a role list, or null for any session. */
function gateOf(operation: string): string[] | null {
  const [method, route] = operation.split(" ");
  const file = path.join(
    API_DIR,
    route.replace(/^\/api\//, "").replace(/\{(\w+)\}/g, "[$1]"),
    "route.ts",
  );
  const text = readFileSync(file, "utf8");
  const helpers = new Map<string, string[][]>();
  for (const m of text.matchAll(
    /function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n/g,
  )) {
    const calls = [...m[2].matchAll(/requireAuth\(([^)]*)\)/g)];
    if (calls.length > 0 && !/^(GET|POST|PUT|PATCH|DELETE)$/.test(m[1])) {
      helpers.set(
        m[1],
        calls.map((c) => rolesOf(c[1]) ?? []),
      );
    }
  }
  const handler = new RegExp(
    `export async function ${method}\\b([\\s\\S]*?)(?=\\nexport async function|$)`,
  ).exec(text);
  if (!handler) throw new Error(`${operation}: no such handler in ${file}`);
  const lists: (string[] | null)[] = [
    ...handler[1].matchAll(/requireAuth\(([^)]*)\)/g),
  ].map((c) => rolesOf(c[1]));
  for (const [name, helperLists] of helpers) {
    if (new RegExp(`\\b${name}\\(`).test(handler[1]))
      lists.push(...helperLists);
  }
  if (lists.length === 0) throw new Error(`${operation}: no requireAuth()`);
  if (lists.some((l) => l === null)) return null;
  return [...new Set(lists.flatMap((l) => l ?? []))].sort();
}

describe("which role to sign in with (lib/api-sign-in.ts)", () => {
  it("has a row for every role but the base participant role", () => {
    expect(API_SIGN_IN_ROWS.map((r) => r.role).sort()).toEqual(
      [
        "DATA_HOLDER",
        "DATA_USER",
        "EDC_ADMIN",
        "HDAB_AUTHORITY",
        "PATIENT",
        "TRUST_CENTER_OPERATOR",
      ].sort(),
    );
  });

  for (const row of API_SIGN_IN_ROWS) {
    it(`${row.role}: every operation the row promises admits the role`, () => {
      expect(row.admits.length).toBeGreaterThan(0);
      const refused = row.admits.filter((op) => {
        const gate = gateOf(op);
        return gate !== null && !gate.includes(row.role);
      });
      expect(refused).toEqual([]);
    });

    if (row.refusesOperator) {
      it(`${row.role}: the operations it says the operator may not call refuse EDC_ADMIN`, () => {
        const open = row.refusesOperator!.filter((op) => {
          const gate = gateOf(op);
          return gate === null || gate.includes("EDC_ADMIN");
        });
        expect(open).toEqual([]);
      });
    }
  }

  it("sends the reader to a demo user the realm gives that role", () => {
    const realm = JSON.parse(
      readFileSync(path.join(UI, "../jad/keycloak-realm.json"), "utf8"),
    ) as { users: { username: string; realmRoles?: string[] }[] };
    const rolesOfUser = new Map(
      realm.users.map((u) => [u.username, u.realmRoles ?? []]),
    );
    for (const row of API_SIGN_IN_ROWS) {
      const users = demoUsersFor(row.role);
      expect(users.length, row.role).toBeGreaterThan(0);
      for (const user of users) {
        const held = rolesOfUser.get(user);
        expect(held, `${user} is not in jad/keycloak-realm.json`).toBeDefined();
        // Either the user holds the role, or (a role no demo user holds) the
        // row falls back to the operator, whom its operations must admit.
        if (!held!.includes(row.role)) {
          expect(user).toBe("edcadmin");
          for (const op of row.admits) {
            expect(gateOf(op) ?? ["EDC_ADMIN"], op).toContain("EDC_ADMIN");
          }
        }
      }
    }
  });

  it("no demo user holds TRUST_CENTER_OPERATOR, as its row says", () => {
    expect(demoUsersFor("TRUST_CENTER_OPERATOR")).toEqual(["edcadmin"]);
  });

  it("has every row text in every language", () => {
    for (const row of API_SIGN_IN_ROWS) {
      expect(MESSAGES.en.docsDeveloper).toHaveProperty([row.opens]);
      for (const lang of ["de", "fr", "nl", "es"] as const) {
        const dict = MESSAGES[lang].docsDeveloper as Record<string, string>;
        expect(dict[row.opens], `${lang}: ${row.role}`).toBeTruthy();
        expect(dict[row.opens], `${lang}: ${row.role}`).not.toBe(row.opens);
      }
    }
  });

  it("repeats the table in the OpenAPI description, user by user", () => {
    const spec = readFileSync(path.join(UI, "public/openapi.yaml"), "utf8");
    for (const row of API_SIGN_IN_ROWS) {
      const line = spec
        .split("\n")
        .find((l) => l.trim().startsWith("|") && l.includes(`\`${row.role}\``));
      expect(line, `no table line for ${row.role}`).toBeDefined();
      for (const user of demoUsersFor(row.role)) {
        // regulator-es is a second access body of the same role; one is enough.
        if (user === "regulator-es") continue;
        expect(line, row.role).toContain(`\`${user}\``);
      }
    }
  });
});
