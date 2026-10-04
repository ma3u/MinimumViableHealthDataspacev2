import type { Metadata } from "next";
import OfflineNotice from "@/components/OfflineNotice";

export const metadata: Metadata = {
  title: "Live demo offline | European Health Data Space",
  robots: { index: false },
};

/**
 * Shown for every page while the live stack is stopped (ADR-053). The
 * middleware rewrites to this route and keeps the visitor's URL, so the
 * notice can link the very page they asked for on the static site.
 */
export default function OfflinePage() {
  return <OfflineNotice />;
}
