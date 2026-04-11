"use client";

/**
 * Tab-scoped session isolation for live Keycloak mode.
 *
 * Problem: Keycloak session cookies are origin-scoped — shared across all
 * browser tabs. When Tab 2 switches to patient1, Tab 1 (edcadmin) silently
 * picks up patient1's cookie on the next NextAuth polling cycle.
 *
 * Solution: On first authenticated load, snapshot {username, email, roles}
 * into sessionStorage (tab-scoped). Subsequent renders use the snapshot
 * for display, ignoring cookie changes from other tabs.
 *
 * The snapshot is refreshed when:
 * - The tab navigates through the explicit switchPersona flow, which sets
 *   "session-switch-pending" in sessionStorage before redirecting.
 * - The page loads fresh with no existing snapshot.
 */

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

const SNAPSHOT_KEY = "tab-session-snapshot";
const SWITCH_PENDING_KEY = "session-switch-pending";

export interface TabSession {
  username: string;
  email: string;
  roles: string[];
}

/** Mark that this tab is intentionally switching users. */
export function markSessionSwitch(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SWITCH_PENDING_KEY, "true");
  }
}

/** Read the snapshot from sessionStorage (sync). */
function readSnapshot(): TabSession | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TabSession;
  } catch {
    return null;
  }
}

/** Write snapshot to sessionStorage. */
function writeSnapshot(snap: TabSession): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  }
}

/** Check and clear the switch-pending flag. */
function consumeSwitchPending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const pending = sessionStorage.getItem(SWITCH_PENDING_KEY);
  if (pending) {
    sessionStorage.removeItem(SWITCH_PENDING_KEY);
    return true;
  }
  return false;
}

/**
 * React hook — returns a tab-scoped session that is immune to cross-tab
 * cookie changes.
 *
 * In live mode (IS_STATIC=false), this should replace direct useSession()
 * calls in Navigation.tsx and UserMenu.tsx.
 *
 * Returns { session, status } similar to useSession() but the session
 * data comes from a tab-scoped snapshot once established.
 */
export function useTabSession(): {
  session: TabSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
  liveSession: ReturnType<typeof useSession>["data"];
} {
  const { data: liveSession, status: liveStatus } = useSession();
  const [tabSession, setTabSession] = useState<TabSession | null>(() =>
    readSnapshot(),
  );

  useEffect(() => {
    // On mount, check if a switch was pending (user explicitly switched in THIS tab)
    const switchPending = consumeSwitchPending();

    if (switchPending) {
      // Clear old snapshot — will be replaced by the new session below
      sessionStorage.removeItem(SNAPSHOT_KEY);
      setTabSession(null);
    }
  }, []);

  useEffect(() => {
    if (liveStatus !== "authenticated" || !liveSession) return;

    const existing = readSnapshot();
    if (existing) {
      // Snapshot exists — keep using it (ignore cross-tab cookie changes)
      return;
    }

    // No snapshot yet (first load or after switch) — take the live session
    const roles = (liveSession as { roles?: string[] }).roles ?? [];
    const snap: TabSession = {
      username: liveSession.user?.name ?? liveSession.user?.email ?? "",
      email: liveSession.user?.email ?? "",
      roles: [...roles],
    };
    writeSnapshot(snap);
    setTabSession(snap);
  }, [liveSession, liveStatus]);

  // If we have a snapshot, use it; otherwise fall through to live status
  if (tabSession) {
    return {
      session: tabSession,
      status: "authenticated",
      liveSession,
    };
  }

  return {
    session: null,
    status: liveStatus,
    liveSession,
  };
}
