import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Role-based route protection middleware (Phase 2c).
 *
 * Route rules (from planning doc):
 *   /admin/*     → requires EDC_ADMIN
 *   /compliance  → requires HDAB_AUTHORITY
 *   /onboarding  → requires authenticated (any role)
 *   All other UI routes → public (no auth required)
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

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Protected routes require authentication
        const protectedPaths = ["/admin", "/compliance", "/onboarding"];
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
  matcher: ["/admin/:path*", "/compliance/:path*", "/onboarding/:path*"],
};
