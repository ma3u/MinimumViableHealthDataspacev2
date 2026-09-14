"use client";

/**
 * Applies `?persona=<personaId>` on any page, not just /graph.
 *
 * The static export has no session, so a role-filtered view comes from the
 * persona in sessionStorage, which until now could only be set by clicking a
 * card on /demo. That makes a deep link into the middle of a journey useless:
 * open `/negotiate` cold and you get the signed-out view, so a demo script has
 * to begin every step with "first go to /demo and click Researcher".
 *
 * Mounted in the root layout, so one link per step is enough:
 *
 *     /negotiate?persona=researcher
 *     /compliance?persona=hdab
 *
 * Accepts a personaId ("researcher", "hdab", "hospital", "edc-admin",
 * "patient") or a username ("regulator", "clinicuser"), because the demo
 * script and the credentials table use different ones and a reader copying
 * either should not land on a silently wrong view.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DEMO_PERSONAS } from "@/lib/auth";
import { setDemoPersona } from "@/lib/use-demo-persona";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

export default function PersonaFromQuery() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("persona");

  useEffect(() => {
    if (!IS_STATIC || !requested) return;
    const match =
      DEMO_PERSONAS.find((p) => p.personaId === requested) ??
      DEMO_PERSONAS.find((p) => p.username === requested);
    if (match) setDemoPersona(match.username);
  }, [requested]);

  return null;
}
