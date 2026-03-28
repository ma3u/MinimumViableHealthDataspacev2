"use client";

/**
 * Demo persona store for static GitHub Pages export.
 *
 * In a static build (NEXT_PUBLIC_STATIC_EXPORT=true) there is no server
 * session, so useSession() always returns unauthenticated.  This module
 * provides a localStorage-backed persona that Navigation and UserMenu
 * read to simulate the correct role-filtered view for each demo user.
 *
 * Usage:
 *   setDemoPersona("patient1")   — call from the /demo hub page
 *   const persona = useDemoPersona()  — read in Navigation / UserMenu
 */

import { useState, useEffect } from "react";
import { DEMO_PERSONAS } from "@/lib/auth";

export const DEMO_PERSONA_KEY = "demo-persona";

// Module-level EventTarget so setDemoPersona() triggers re-renders on the
// same tab (window "storage" event only fires in *other* tabs).
const emitter: EventTarget | null =
  typeof window !== "undefined" ? new EventTarget() : null;

/** Write the active demo persona to localStorage and notify all hooks. */
export function setDemoPersona(username: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DEMO_PERSONA_KEY, username);
  emitter?.dispatchEvent(new Event("change"));
}

/** Read the active demo persona username from localStorage (sync, no hooks). */
export function getDemoPersonaUsername(): string {
  if (typeof localStorage === "undefined") return "edcadmin";
  return localStorage.getItem(DEMO_PERSONA_KEY) ?? "edcadmin";
}

export type DemoPersona = (typeof DEMO_PERSONAS)[number];

/**
 * React hook — returns the active demo persona object.
 * Initialises with the edcadmin fallback (matches legacy DEMO_SESSION),
 * then updates synchronously once the component mounts and localStorage
 * can be read.
 *
 * Must be called unconditionally (React Rules of Hooks).
 * In live (non-static) mode its return value should simply be ignored.
 */
export function useDemoPersona(): DemoPersona {
  const [persona, setPersona] = useState<DemoPersona>(
    () => DEMO_PERSONAS.find((p) => p.username === "edcadmin")!,
  );

  useEffect(() => {
    function read() {
      const stored = localStorage.getItem(DEMO_PERSONA_KEY);
      const found = DEMO_PERSONAS.find((p) => p.username === stored);
      if (found) setPersona(found);
    }

    read(); // synchronous first read after hydration
    emitter?.addEventListener("change", read);
    window.addEventListener("storage", read); // cross-tab support
    return () => {
      emitter?.removeEventListener("change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return persona;
}
