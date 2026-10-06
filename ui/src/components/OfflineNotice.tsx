"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Moon } from "lucide-react";
import {
  STATIC_SITE_URL,
  nextOpening,
  staticSiteUrl,
} from "@/lib/offline-mode";

/**
 * The off-hours notice (ADR-053). It reads the address bar, not a query
 * parameter, because the middleware rewrites the visitor's own URL to
 * /offline; the time is formatted in the browser, in the visitor's zone.
 */
export default function OfflineNotice() {
  const [target, setTarget] = useState(`${STATIC_SITE_URL}/`);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const { pathname, search } = window.location;
    setTarget(staticSiteUrl(`${pathname}${search}`));
    setOpening(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(nextOpening(new Date())),
    );
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <section
        role="status"
        aria-labelledby="offline-title"
        data-testid="offline-notice"
        className="bg-(--surface-2) rounded-lg p-8 max-w-lg w-full mx-4 text-center"
      >
        <Moon size={48} className="mx-auto mb-4 text-amber-400" />
        <h1 id="offline-title" className="text-2xl font-bold mb-2">
          The live demo is offline outside office hours
        </h1>
        <p className="text-(--text-secondary) mb-2">
          To save running costs, the live dataspace and its databases are
          stopped every evening, at weekends and on Berlin public holidays. It
          runs on weekdays from about 07:30 to 20:15 Berlin time in summer and
          from about 06:30 to 19:15 in winter.
        </p>
        <p
          className="text-(--text-secondary) mb-6"
          data-testid="offline-opening"
        >
          {opening ? (
            <>Back on {opening}.</>
          ) : (
            <>Back on the next working day.</>
          )}
        </p>
        <a
          href={target}
          data-testid="offline-static-link"
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors"
        >
          Open this page in the static demo
          <ExternalLink size={16} aria-hidden="true" />
        </a>
        <p className="text-xs text-(--text-secondary) mt-4">
          The static demo is always available. It has the same pages with
          synthetic data and a persona picker in place of sign-in.
        </p>
      </section>
    </div>
  );
}
