"use client";

/**
 * Demo persona store for static GitHub Pages export.
 *
 * In a static build (NEXT_PUBLIC_STATIC_EXPORT=true) there is no server
 * session, so useSession() always returns unauthenticated.  This module
 * provides a sessionStorage-backed persona that Navigation and UserMenu
 * read to simulate the correct role-filtered view for each demo user.
 *
 * sessionStorage is intentionally tab-scoped: switching persona in one tab
 * does NOT affect other open tabs (use localStorage if you want shared state).
 *
 * Usage:
 *   setDemoPersona("patient1")   — call from the /demo hub page
 *   const persona = useDemoPersona()  — read in Navigation / UserMenu
 */

import { useState, useEffect } from "react";
import { DEMO_PERSONAS } from "@/lib/auth";

export const DEMO_PERSONA_KEY = "demo-persona";
/** Sentinel value indicating user explicitly signed out. */
export const SIGNED_OUT = "__signed_out__";

// Module-level EventTarget so setDemoPersona() triggers re-renders on the
// same tab (window "storage" event only fires in *other* tabs).
const emitter: EventTarget | null =
  typeof window !== "undefined" ? new EventTarget() : null;

/** Write the active demo persona to sessionStorage and notify same-tab hooks. */
export function setDemoPersona(username: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DEMO_PERSONA_KEY, username);
  emitter?.dispatchEvent(new Event("change"));
}

/** Mark the user as signed out in static demo mode. */
export function clearDemoPersona(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DEMO_PERSONA_KEY, SIGNED_OUT);
  emitter?.dispatchEvent(new Event("change"));
}

/** Read the active demo persona username from sessionStorage (sync, no hooks). */
export function getDemoPersonaUsername(): string {
  if (typeof sessionStorage === "undefined") return "edcadmin";
  const stored = sessionStorage.getItem(DEMO_PERSONA_KEY);
  if (!stored || stored === SIGNED_OUT) return "edcadmin";
  return stored;
}

/** Check if user is signed out (static mode only). */
export function isDemoSignedOut(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(DEMO_PERSONA_KEY) === SIGNED_OUT;
}

export type DemoPersona = (typeof DEMO_PERSONAS)[number];

/**
 * React hook — returns the active demo persona object, or null if signed out.
 * Initialises with the edcadmin fallback (matches legacy DEMO_SESSION),
 * then updates synchronously once the component mounts and sessionStorage
 * can be read.
 *
 * Must be called unconditionally (React Rules of Hooks).
 * In live (non-static) mode its return value should simply be ignored.
 */
export function useDemoPersona(): DemoPersona | null {
  const [persona, setPersona] = useState<DemoPersona | null>(
    () => DEMO_PERSONAS.find((p) => p.username === "edcadmin")!,
  );

  useEffect(() => {
    function read() {
      const stored = sessionStorage.getItem(DEMO_PERSONA_KEY);
      if (stored === SIGNED_OUT) {
        setPersona(null);
        return;
      }
      const found = DEMO_PERSONAS.find((p) => p.username === stored);
      if (found) setPersona(found);
    }

    read(); // synchronous first read after hydration
    // emitter handles same-tab reactivity; no cross-tab sync by design
    emitter?.addEventListener("change", read);
    return () => {
      emitter?.removeEventListener("change", read);
    };
  }, []);

  return persona;
}
