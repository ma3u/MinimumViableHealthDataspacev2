import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Role-based route protection + per-request Content-Security-Policy.
 *
 * Route rules:
 *   /admin/*                   → requires EDC_ADMIN
 *   /compliance                → requires HDAB_AUTHORITY or EDC_ADMIN
 *   /patient/profile           → requires PATIENT or EDC_ADMIN
 *   /patient/research          → requires PATIENT or EDC_ADMIN
 *   /patient/insights          → requires PATIENT or EDC_ADMIN
 *   /onboarding/*              → requires authenticated (any role)
 *   /credentials               → requires authenticated (any role)
 *   /settings                  → requires authenticated (any role)
 *   /data/*                    → requires authenticated (any role)
 *   /negotiate                 → requires authenticated (any role)
 *   /patient (index), /graph   → public (no auth required)
 *   All other UI               → public (no auth required)
 *
 * CSP:
 *   Every HTML response gets a per-request nonce so we can drop
 *   'unsafe-inline' from script-src. Next.js automatically propagates
 *   the nonce to its framework scripts when it reads the `x-nonce`
 *   request header we set below. style-src-attr still needs
 *   'unsafe-inline' for React's `style={}` prop (CSP3 separation).
 *
 * API routes (/api/*) are excluded — they handle auth internally.
 */

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
    `script-src-elem 'self' 'nonce-${nonce}'`,
    // style-src-elem blocks unnonced <style> tags; style-src-attr
    // still allows React inline style attributes (CSP3 split).
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}' 'unsafe-inline'`,
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

function applyCspHeaders(req: Request, res: NextResponse): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildCsp(nonce, isDev);

  // Propagate nonce to the request so server components can read it
  // via `headers().get('x-nonce')` and pass it to <Script nonce>.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);

  // Rebuild the response with forwarded request headers (Next.js trick
  // for middleware-to-server-component data passing).
  const forwarded = NextResponse.next({ request: { headers: reqHeaders } });
  // Copy any auth-related headers (redirects etc.) from the upstream response.
  res.headers.forEach((value, key) => forwarded.headers.set(key, value));
  forwarded.headers.set("Content-Security-Policy", csp);
  return forwarded;
}

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const roles = (req.nextauth.token?.roles as string[]) ?? [];

    // /admin/* requires EDC_ADMIN
    if (pathname.startsWith("/admin") && !roles.includes("EDC_ADMIN")) {
      return applyCspHeaders(
        req,
        NextResponse.redirect(new URL("/auth/unauthorized", req.url)),
      );
    }

    // /compliance requires HDAB_AUTHORITY or EDC_ADMIN
    if (
      pathname.startsWith("/compliance") &&
      !roles.includes("HDAB_AUTHORITY") &&
      !roles.includes("EDC_ADMIN")
    ) {
      return applyCspHeaders(
        req,
        NextResponse.redirect(new URL("/auth/unauthorized", req.url)),
      );
    }

    // /patient/profile|research|insights require PATIENT or EDC_ADMIN (GDPR Art. 15-22)
    const patientSubRoutes = [
      "/patient/profile",
      "/patient/research",
      "/patient/insights",
    ];
    if (patientSubRoutes.some((p) => pathname.startsWith(p))) {
      if (!roles.includes("PATIENT") && !roles.includes("EDC_ADMIN")) {
        return applyCspHeaders(
          req,
          NextResponse.redirect(new URL("/auth/unauthorized", req.url)),
        );
      }
    }

    return applyCspHeaders(req, NextResponse.next());
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Protected routes require authentication
        const protectedPaths = [
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
        ];
        const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

        if (isProtected) {
          return !!token;
        }

        // All other routes are public (CSP middleware still runs)
        return true;
      },
    },
  },
);

export const config = {
  // Run on every route except API routes, Next.js static assets, and
  // mock JSON fixtures. CSP is applied to HTML responses; auth checks
  // only fire on the `protectedPaths` list above.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|swagger-ui|mock|static).*)",
  ],
};
