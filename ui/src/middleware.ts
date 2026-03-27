import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Role-based route protection middleware (Phase 2c + 6b + 20a).
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
 * API routes (/api/*) are excluded — they handle auth internally.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const roles = (req.nextauth.token?.roles as string[]) ?? [];

    // /admin/* requires EDC_ADMIN
    if (pathname.startsWith("/admin") && !roles.includes("EDC_ADMIN")) {
      return NextResponse.redirect(new URL("/auth/unauthorized", req.url));
    }

    // /compliance requires HDAB_AUTHORITY or EDC_ADMIN
    if (
      pathname.startsWith("/compliance") &&
      !roles.includes("HDAB_AUTHORITY") &&
      !roles.includes("EDC_ADMIN")
    ) {
      return NextResponse.redirect(new URL("/auth/unauthorized", req.url));
    }

    // /patient/profile|research|insights require PATIENT or EDC_ADMIN (GDPR Art. 15-22)
    const patientSubRoutes = [
      "/patient/profile",
      "/patient/research",
      "/patient/insights",
    ];
    if (patientSubRoutes.some((p) => pathname.startsWith(p))) {
      if (!roles.includes("PATIENT") && !roles.includes("EDC_ADMIN")) {
        return NextResponse.redirect(new URL("/auth/unauthorized", req.url));
      }
    }

    return NextResponse.next();
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

        // All other routes are public
        return true;
      },
    },
  },
);

export const config = {
  // Only run middleware on UI routes, not API routes or static files
  matcher: [
    "/admin/:path*",
    "/compliance/:path*",
    "/onboarding/:path*",
    "/credentials/:path*",
    "/settings/:path*",
    "/data/:path*",
    "/negotiate/:path*",
    "/patient/profile/:path*",
    "/patient/research/:path*",
    "/patient/insights/:path*",
  ],
};
