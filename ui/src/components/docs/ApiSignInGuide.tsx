"use client";

/**
 * "Sign in first": what stands above both API explorers (Scalar and Swagger
 * UI). Every route needs a session (ADR-044), the explorers send the browser's
 * session cookie by themselves, and which user to sign in as depends on the
 * group of operations: lib/api-sign-in.ts holds the table.
 *
 * It also says where the reader stands right now: signed in as whom, with
 * which roles, or not at all, since that decides whether the first request
 * answers 200, 401 or 403.
 */
import Link from "next/link";
import { useSession } from "next-auth/react";
import { KeyRound } from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";
import { T, useT } from "@/lib/i18n/translate";
import { API_SIGN_IN_ROWS, demoUsersFor } from "@/lib/api-sign-in";

const ADRS =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/";
const ADR_044_URL = `${ADRS}ADR-044-every-api-route-needs-a-session.md`;
const ADR_054_URL = `${ADRS}ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md`;

export function ApiSignInGuide({ returnTo }: { returnTo: string }) {
  const t = useT("docsDeveloper");
  const { data: session, status } = useSession();
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(returnTo)}`;

  return (
    <section
      aria-labelledby="api-sign-in-title"
      data-testid="api-sign-in-guide"
      // One box above the explorer, not a chapter: DocsToc leaves it unnumbered.
      data-toc-skip
      className="rounded-lg border border-(--border) bg-(--surface-2) p-4 text-sm text-(--text-secondary)"
    >
      <h2
        id="api-sign-in-title"
        className="flex items-center gap-2 text-base font-semibold text-(--text-primary)"
      >
        <KeyRound size={16} aria-hidden="true" />
        {t("Sign in first, then try a request")}
      </h2>

      <p className="mt-2" data-testid="api-sign-in-status">
        {IS_STATIC ? (
          t(
            "This static site has no API routes: the explorer shows the reference, and a request needs a running hub.",
          )
        ) : status === "authenticated" ? (
          <>
            <strong className="text-(--text-primary)">
              {t("You are signed in as {name} ({roles}).", {
                name: session?.user?.name ?? "?",
                roles: roles.join(", ") || "-",
              })}
            </strong>{" "}
            <Link href={signInHref} className="text-(--accent) underline">
              {t("Sign in as another user")}
            </Link>
          </>
        ) : status === "loading" ? (
          t("Checking your session…")
        ) : (
          <>
            <strong className="text-(--text-primary)">
              {t("You are not signed in: a request from here answers 401.")}
            </strong>{" "}
            <Link href={signInHref} className="text-(--accent) underline">
              {t("Sign in")}
            </Link>
          </>
        )}
      </p>

      <p className="mt-2">
        <T
          area="docsDeveloper"
          tags={{
            adr: (
              <a
                href={ADR_044_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--accent) underline"
              />
            ),
            app: (
              <a
                href={ADR_054_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--accent) underline"
              />
            ),
            a: <Link href={signInHref} className="text-(--accent) underline" />,
          }}
        >
          {
            "Every route needs a session, except the health probe, the sign-in flows and the Klarbefund app's own account creation (<adr>ADR-044</adr>, <app>ADR-054</app>). <a>Sign in</a> in this browser: the explorer then sends your session cookie with each request. There is no key to paste and nothing to enter under Authorize."
          }
        </T>
      </p>
      <p className="mt-2">
        <T
          area="docsDeveloper"
          tags={{ b: <strong className="text-(--text-primary)" /> }}
        >
          {
            "Start as <b>edcadmin</b>: the operator may call most operations. A few answer only their own role, the access body's decisions and a patient's phone and wallet among them. There the operator gets a 403, and the table says who to sign in as instead."
          }
        </T>
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-(--border) text-(--text-primary)">
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                {t("Sign in as")}
              </th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                {t("Role")}
              </th>
              <th scope="col" className="py-1.5 font-semibold">
                {t("Opens")}
              </th>
            </tr>
          </thead>
          <tbody>
            {API_SIGN_IN_ROWS.map((row) => (
              <tr
                key={row.role}
                className={`border-b border-(--border)/60 align-top ${
                  roles.includes(row.role) ? "bg-(--accent)/10" : ""
                }`}
                data-testid={`api-sign-in-row-${row.role}`}
              >
                <td className="py-1.5 pr-3 font-mono text-(--text-primary) whitespace-nowrap">
                  {demoUsersFor(row.role).join(", ")}
                </td>
                <td className="py-1.5 pr-3 font-mono whitespace-nowrap">
                  {row.role}
                </td>
                <td className="py-1.5">{t(row.opens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs">
        {t(
          "On the demo realm each demo user's password is its user name. Without a session a route answers 401, with the wrong role 403, both with an error message in the body.",
        )}
      </p>
    </section>
  );
}
