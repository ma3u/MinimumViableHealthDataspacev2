"use client";

import { Loader2, PowerOff } from "lucide-react";
import type { SpeColdStartBody } from "@/lib/spe";
import { useT } from "@/lib/i18n/translate";

/**
 * What a researcher sees instead of an error when a federated query needs a
 * workspace that is not up (ADR-072): which one, that it is starting or
 * stopped, and roughly how long.
 */
export function SpeColdStartNotice({ body }: { body: SpeColdStartBody }) {
  const t = useT("research");
  const entries = body.spes?.length ? body.spes : [body.spe];
  return (
    <div
      role="status"
      aria-label={t("Secure processing environment not ready")}
      className="bg-(--warning)/10 border border-(--warning)/30 rounded-lg px-4 py-3 text-sm text-(--warning-text) space-y-1"
    >
      {entries.map((spe) => (
        <p key={spe.id} className="flex items-start gap-2">
          {spe.state === "starting" ? (
            <Loader2
              size={16}
              className="animate-spin mt-0.5 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <PowerOff
              size={16}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
          )}
          <span>
            {spe.state === "starting"
              ? t(
                  "{id} is starting (cold start, about 3 to 4 minutes): attesting, releasing the key, loading the data. Try again in a few minutes.",
                  { id: spe.id },
                )
              : t(
                  "{id} is stopped. An operator or the access body can start it.",
                  { id: spe.id },
                )}
          </span>
        </p>
      ))}
    </div>
  );
}
