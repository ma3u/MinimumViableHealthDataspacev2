/**
 * The user guide shows a screenshot of each feature's page on mouse-over.
 *
 * Every card's page is listed with the demo persona whose menu holds it, so
 * the screenshot shows what that persona sees. `null` is a signed-out visitor.
 * __tests__/e2e/capture-guide-screenshots.spec.ts takes them from the static
 * site; __tests__/unit/lib/guide-screenshots.test.ts fails when a card has no
 * screenshot or a screenshot no card.
 */
import { IS_STATIC } from "@/lib/static-export";

export const GUIDE_SCREENS: { href: string; persona: string | null }[] = [
  { href: "/auth/signin", persona: null },
  { href: "/", persona: null },
  { href: "/onboarding", persona: "edcadmin" },
  { href: "/settings", persona: "clinicuser" },
  { href: "/overview", persona: "regulator" },
  { href: "/catalog", persona: "clinicuser" },
  { href: "/catalog/editor", persona: "clinicuser" },
  { href: "/patient", persona: "patient1" },
  { href: "/analytics", persona: "researcher" },
  { href: "/query", persona: "researcher" },
  { href: "/eehrxf", persona: "clinicuser" },
  { href: "/patient/query", persona: "patient1" },
  { href: "/patient/profile", persona: "patient1" },
  { href: "/patient/research", persona: "patient1" },
  { href: "/patient/insights", persona: "patient1" },
  { href: "/compliance", persona: "regulator" },
  { href: "/compliance/tck", persona: "regulator" },
  { href: "/credentials", persona: "regulator" },
  { href: "/applications", persona: "researcher" },
  { href: "/requests", persona: "researcher" },
  { href: "/supervision", persona: "regulator" },
  { href: "/permits", persona: "regulator" },
  { href: "/activity-report", persona: "regulator" },
  { href: "/information", persona: "regulator" },
  { href: "/data/share", persona: "clinicuser" },
  { href: "/data/discover", persona: "researcher" },
  { href: "/negotiate", persona: "researcher" },
  { href: "/tasks", persona: "researcher" },
  { href: "/data/transfer", persona: "researcher" },
  { href: "/admin", persona: "edcadmin" },
  { href: "/admin/components", persona: "edcadmin" },
  { href: "/admin/tenants", persona: "edcadmin" },
  { href: "/admin/participants", persona: "edcadmin" },
  { href: "/admin/policies", persona: "edcadmin" },
  { href: "/admin/audit", persona: "edcadmin" },
];

/** `/patient/query` → `patient-query`, `/` → `home`. */
export function guideScreenshotSlug(href: string): string {
  return href.replace(/^\//, "").replace(/\//g, "-") || "home";
}

/** Where the page finds the screenshot, under the static site's base path. */
export function guideScreenshotSrc(href: string): string | null {
  if (!GUIDE_SCREENS.some((s) => s.href === href)) return null;
  const base = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
  return `${base}/images/guide/${guideScreenshotSlug(href)}.webp`;
}
