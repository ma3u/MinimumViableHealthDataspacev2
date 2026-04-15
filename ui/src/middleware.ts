import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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
 *   /admin/*                   → requires EDC_ADMIN
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
  "/patient/profile",
  "/patient/research",
  "/patient/insights",
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
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildCsp(nonce, isDev);
  const { pathname } = req.nextUrl;

  // Auth gate for protected routes.
  if (isProtected(pathname)) {
    const token = await getToken({ req });
    if (!token) {
      const signInUrl = new URL("/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", req.url);
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
  // Run on every route except API routes, Next.js static assets, and
  // mock JSON fixtures. CSP is applied to HTML responses; auth checks
  // only fire on the PROTECTED_PATHS list.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|swagger-ui|mock|static).*)",
  ],
};
