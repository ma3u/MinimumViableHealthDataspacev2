import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  STATIC_SITE_URL,
  apiAnswersOffline,
  isLiveDemoOffline,
} from "@/lib/offline-mode";

/**
 * Role-based route protection + per-request Content-Security-Policy.
 *
 * IMPORTANT: we do NOT wrap this in `withAuth()` from next-auth/middleware.
 * `withAuth` intercepts the response and rebuilds it internally, which strips
 * the `request: { headers }` option we pass to `NextResponse.next()`. That
 * option is how Next.js 15 discovers our per-request nonce and injects it
 * into its own streaming `<script>` tags. Without it, every framework inline
 * script is blocked by our CSP. So we do the auth check manually via
 * `getToken()` and fully own the response chain.
 *
 * Route rules (auth required):
 *   /admin/policies            → requires HDAB_AUTHORITY or EDC_ADMIN
 *   /admin/audit               → requires HDAB_AUTHORITY or EDC_ADMIN
 *   /admin/*  (other)          → requires EDC_ADMIN
 *   /compliance                → requires HDAB_AUTHORITY or EDC_ADMIN
 *   /patient/profile           → requires PATIENT or EDC_ADMIN
 *   /patient/research          → requires PATIENT or EDC_ADMIN
 *   /patient/insights          → requires PATIENT or EDC_ADMIN
 *   /onboarding/*              → any authenticated
 *   /credentials               → any authenticated
 *   /settings                  → any authenticated
 *   /data/*                    → any authenticated
 *   /negotiate                 → any authenticated
 *   All other UI routes        → public (CSP still applied)
 *
 * CSP:
 *   Every HTML response gets a per-request nonce so we can drop
 *   'unsafe-inline' from script-src. Next.js automatically propagates the
 *   nonce to its framework scripts when it reads the `Content-Security-Policy`
 *   REQUEST header we set on the forwarded request. style-src-attr still
 *   needs 'unsafe-inline' for React's `style={}` prop (CSP3 separation).
 */

const PROTECTED_PATHS = [
  "/admin",
  "/compliance",
  "/onboarding",
  "/credentials",
  "/settings",
  "/data",
  "/negotiate",
  // #357 reopened: the patient landing page is gated too, so an anonymous
  // visitor is sent to sign in rather than shown a page whose only data call
  // now answers 401. The three below stay listed because requiresRole() keys
  // off them for PATIENT / EDC_ADMIN; "/patient" alone needs a session and no
  // particular role, which matches what /api/patient enforces.
  "/patient",
  "/patient/profile",
  "/patient/research",
  "/patient/insights",
  "/requests",
  "/applications",
  "/supervision",
  "/overview",
  // #404: every API route needs a session (ADR-044), so the pages whose data
  // was public until then send an anonymous visitor to sign in too.
  "/graph",
  "/permits",
  "/information",
  "/activity-report",
  // Their APIs already needed a session, so a signed-out visitor saw empty
  // panels; now they are sent to sign in, like /patient (#357).
  "/catalog",
  "/analytics",
  "/query",
  "/eehrxf",
  "/tasks",
] as const;

function generateNonce(): string {
  // Edge runtime has globalThis.crypto
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string, isDev: boolean): string {
  // 'strict-dynamic' lets the initial nonced script load further scripts
  // without needing them individually allowlisted. In dev we allow
  // 'unsafe-eval' because Next.js's Hot Module Replacement needs it.
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // script-src-elem falls back to script-src when omitted, so we don't
    // set it — keeping one source of truth avoids divergence where the elem
    // directive is stricter than the parent and blocks nonced inline scripts.
    // style-src: NO nonce here. When a nonce and 'unsafe-inline' both appear
    // in style-src, browsers ignore 'unsafe-inline' — and Next.js injects
    // <style> tags for CSS-in-JS that aren't nonced, so they'd get blocked.
    // Keeping 'unsafe-inline' is the pragmatic trade-off (CSS injection is
    // far lower risk than JS injection) and is still CSP3-compliant.
    `style-src 'self' 'unsafe-inline'`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // connect-src: same-origin for /api/*, plus websocket for Next.js HMR in dev
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

function requiresRole(pathname: string): string[] | null {
  // HDAB-shared admin pages: policies (Art. 46 ODRL) and audit (Art. 37/38/53)
  // are part of the regulator's supervision toolkit. Navigation.tsx exposes
  // them to HDAB_AUTHORITY, so the middleware must match. All other /admin/*
  // routes (tenants, components, etc.) stay EDC_ADMIN only.
  if (
    pathname.startsWith("/admin/policies") ||
    pathname.startsWith("/admin/audit")
  ) {
    return ["HDAB_AUTHORITY", "EDC_ADMIN"];
  }
  if (pathname.startsWith("/admin")) return ["EDC_ADMIN"];
  if (pathname.startsWith("/compliance"))
    return ["HDAB_AUTHORITY", "EDC_ADMIN"];
  if (
    pathname.startsWith("/patient/profile") ||
    pathname.startsWith("/patient/research") ||
    pathname.startsWith("/patient/insights")
  ) {
    return ["PATIENT", "EDC_ADMIN"];
  }
  return null;
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes are matched only for off-hours mode (ADR-053); online they
  // pass through untouched, without a CSP, as they always did.
  if (pathname.startsWith("/api/")) {
    if (isLiveDemoOffline() && !apiAnswersOffline(pathname)) {
      return NextResponse.json(
        {
          error:
            "The live demo is offline outside office hours; the static demo is always available",
          staticSite: `${STATIC_SITE_URL}/`,
        },
        { status: 503, headers: { "Retry-After": "3600" } },
      );
    }
    return NextResponse.next();
  }

  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildCsp(nonce, isDev);

  // Off hours (ADR-053): every backend is stopped, so every page is the
  // offline notice. A rewrite keeps the visitor's URL, which the notice reads
  // to link the same page on the static site.
  if (isLiveDemoOffline() && pathname !== "/offline") {
    const offHeaders = new Headers(req.headers);
    offHeaders.set("x-nonce", nonce);
    offHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.rewrite(new URL("/offline", req.url), {
      request: { headers: offHeaders },
    });
    res.headers.set("Content-Security-Policy", csp);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Auth gate for protected routes.
  if (isProtected(pathname)) {
    const token = await getToken({ req });
    if (!token) {
      const signInUrl = new URL("/auth/signin", req.url);
      // Path-relative, NOT req.url. Inside the container req.url resolves to
      // the internal bind address, so this emitted
      // `callbackUrl=https://0.0.0.0:3000/admin` on production — deep-linking
      // to a protected page and signing in sent the user to an unreachable
      // host instead of where they were going. Found running the issue #5
      // pentest checklist (J840-J842).
      //
      // A relative path is also the safer shape: NextAuth resolves it against
      // NEXTAUTH_URL, so it cannot be used to bounce a signed-in user to an
      // external origin.
      signInUrl.searchParams.set(
        "callbackUrl",
        `${req.nextUrl.pathname}${req.nextUrl.search}`,
      );
      return withCspResponse(NextResponse.redirect(signInUrl), csp, nonce);
    }
    const required = requiresRole(pathname);
    if (required) {
      const roles = (token.roles as string[] | undefined) ?? [];
      if (!required.some((r) => roles.includes(r))) {
        return withCspResponse(
          NextResponse.redirect(new URL("/auth/unauthorized", req.url)),
          csp,
          nonce,
        );
      }
    }
  }

  // Forward the nonce via request headers so Next.js injects it into
  // framework inline scripts (streaming RSC payload).
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

function withCspResponse(
  res: NextResponse,
  csp: string,
  _nonce: string,
): NextResponse {
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // The first pattern runs on every page except Next.js static assets and
  // mock JSON fixtures. CSP is applied to HTML responses; auth checks
  // only fire on the PROTECTED_PATHS list.
  matcher: [
    // presentations/ holds self-contained reveal.js decks and poc/ the
    // static prototypes, both served as files; like swagger-ui they carry
    // their own scripts, which the nonce CSP would block.
    "/((?!api|_next/static|_next/image|favicon.ico|swagger-ui|presentations|poc|mock|static).*)",
    // Off-hours mode answers data routes with a 503 (ADR-053); the handler
    // passes them straight through otherwise.
    "/api/:path*",
  ],
};
