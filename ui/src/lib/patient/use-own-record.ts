"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { ownPatientId, ownPatientIdForSession } from "@/lib/overview/patient";
import { IS_STATIC } from "@/lib/static-export";

/**
 * Whose record a patient page asks the API for.
 *
 * - `pending`: the session (or, in the static build, the demo persona) is
 *   not known yet; a request made now would name the wrong record and come
 *   back 403 after the right one.
 * - `own`: a patient-only session. `patientId` is the record it owns, the one
 *   `refuseForeignRecord()` lets through (#475), or null when it owns none.
 * - `operator`: any broader session (EDC_ADMIN); the page names the record.
 */
export type RecordSubject =
  | { kind: "pending" }
  | { kind: "own"; patientId: string | null }
  | { kind: "operator" };

/** Mirrors `isPatientOnly()` in own-record.ts, which is server-only. */
function patientOnly(roles: readonly string[]): boolean {
  return roles.includes("PATIENT") && !roles.includes("EDC_ADMIN");
}

/**
 * The signed-in patient's own record, worked out the way the server does:
 * `ownPatientIdForSession()` on the session, so the id a page sends is the
 * one the route accepts. The static build has no session and takes the demo
 * persona instead (patient1 owns P1, patient2 P2).
 */
export function useOwnRecord(): RecordSubject {
  const { data: session, status } = useSession();
  const persona = useDemoPersona();
  // useDemoPersona() starts as edcadmin and reads the stored persona in its
  // first effect; this effect runs in the same pass, so once it has, the
  // persona is the stored one.
  const [personaRead, setPersonaRead] = useState(false);
  useEffect(() => {
    setPersonaRead(true);
  }, []);

  if (IS_STATIC) {
    if (!personaRead) return { kind: "pending" };
    if (!persona || !patientOnly(persona.roles)) return { kind: "operator" };
    return { kind: "own", patientId: ownPatientId(persona.username) };
  }
  if (status === "loading") return { kind: "pending" };
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!patientOnly(roles)) return { kind: "operator" };
  return { kind: "own", patientId: ownPatientIdForSession(session) };
}
