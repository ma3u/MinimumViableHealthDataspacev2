"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut, Network, Shield, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  ROLE_LABELS,
  deriveParticipantType,
  derivePersonaId,
} from "@/lib/auth";

/** Badge colours per role code (compact chip in nav bar and dropdown). */
const ROLE_BADGE: Record<string, string> = {
  EDC_ADMIN: "bg-red-700/80 text-red-100",
  EDC_USER_PARTICIPANT: "bg-blue-700/80 text-blue-100",
  HDAB_AUTHORITY: "bg-amber-700/80 text-amber-100",
  DATA_HOLDER: "bg-blue-600/80 text-blue-100",
  DATA_USER: "bg-green-700/80 text-green-100",
  TRUST_CENTER_OPERATOR: "bg-violet-700/80 text-violet-100",
};

/** Dropdown border accent per primary role. */
const ROLE_ACCENT: Record<string, string> = {
  EDC_ADMIN: "border-red-700",
  HDAB_AUTHORITY: "border-amber-600",
  DATA_HOLDER: "border-blue-600",
  DATA_USER: "border-green-600",
  TRUST_CENTER_OPERATOR: "border-violet-600",
  EDC_USER_PARTICIPANT: "border-blue-700",
};

/** Shield icon colour per primary role. */
const ROLE_SHIELD: Record<string, string> = {
  EDC_ADMIN: "text-red-400",
  HDAB_AUTHORITY: "text-amber-400",
  DATA_HOLDER: "text-blue-400",
  DATA_USER: "text-green-400",
  TRUST_CENTER_OPERATOR: "text-violet-400",
  EDC_USER_PARTICIPANT: "text-gray-400",
};

/** Mock session used in the static GitHub Pages demo. */
const DEMO_SESSION = {
  user: { name: "edcadmin", email: "edcadmin@alpha-klinik.de" },
  roles: ["EDC_ADMIN"],
};

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/**
 * Returns the most meaningful roles to display.
 * Hides EDC_USER_PARTICIPANT when a more specific sub-role is present.
 */
function displayRolesFor(roles: string[]): string[] {
  const specific = roles.filter((r) =>
    [
      "EDC_ADMIN",
      "HDAB_AUTHORITY",
      "DATA_HOLDER",
      "DATA_USER",
      "TRUST_CENTER_OPERATOR",
    ].includes(r),
  );
  if (specific.length === 0 && roles.includes("EDC_USER_PARTICIPANT")) {
    return ["EDC_USER_PARTICIPANT"];
  }
  return specific;
}

/** Short description of what this persona's graph view shows. */
const PERSONA_GRAPH_LABELS: Record<string, string> = {
  "edc-admin": "Participants, contracts and transfers",
  hospital: "My datasets, approvals and contracts",
  researcher: "Available datasets and OMOP analytics",
  hdab: "Approval chains and credentials",
  "trust-center": "Pseudonym chains and SPE sessions",
  default: "Full 5-layer dataspace overview",
};

export default function UserMenu() {
  const { data: liveSession, status: liveStatus } = useSession();
  const session = IS_STATIC ? DEMO_SESSION : liveSession;
  const status = IS_STATIC ? "authenticated" : liveStatus;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500">
        <User size={15} />
        <span className="animate-pulse">…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => !IS_STATIC && signIn("keycloak")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
      >
        <LogIn size={15} />
        Sign in
      </button>
    );
  }

  const roles = (session as typeof DEMO_SESSION).roles ?? [];
  const username = session.user?.name ?? session.user?.email ?? "";
  const shownRoles = displayRolesFor(roles);
  const primaryRole = shownRoles[0] ?? "EDC_USER_PARTICIPANT";
  const personaId = derivePersonaId(roles, username);
  // Derive a friendly participant type for display
  const _participantType = deriveParticipantType(roles, username);

  // Short role label for the nav bar chip
  const navLabel = ROLE_LABELS[primaryRole] ?? username;
  const accentClass = ROLE_ACCENT[primaryRole] ?? "border-gray-600";
  const shieldClass = ROLE_SHIELD[primaryRole] ?? "text-gray-400";

  return (
    <div ref={ref} className="relative">
      {/* ── Nav bar button ── */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        aria-label="User menu"
      >
        <Shield size={14} className={shieldClass} />
        <span className="max-w-[90px] truncate text-xs font-medium">
          {username}
          {IS_STATIC && (
            <span className="ml-1 text-[9px] text-amber-400">(demo)</span>
          )}
        </span>
        {/* Role chip — hidden on very small screens */}
        <span
          className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
            ROLE_BADGE[primaryRole] ?? "bg-gray-600 text-gray-200"
          }`}
        >
          {navLabel}
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className={`absolute right-0 top-full mt-1 w-72 bg-gray-800 border rounded-lg shadow-xl z-50 ${accentClass}`}
        >
          {/* Identity block */}
          <div className="p-3 border-b border-gray-700">
            <p className="text-sm text-white font-semibold truncate">
              {username}
              {IS_STATIC && (
                <span className="ml-1.5 text-[10px] text-amber-400 font-normal">
                  demo mode
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {session.user?.email}
            </p>
            {/* Role badges */}
            <div className="flex flex-wrap gap-1 mt-2">
              {shownRoles.map((role) => (
                <span
                  key={role}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${
                    ROLE_BADGE[role] ?? "bg-gray-600 text-gray-200"
                  } border-transparent`}
                >
                  <Shield size={9} />
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
            </div>
          </div>

          {/* Persona graph deep-link */}
          <div className="p-2 border-b border-gray-700">
            <a
              href={
                personaId === "default"
                  ? "/graph"
                  : `/graph?persona=${personaId}`
              }
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-blue-300 hover:bg-gray-700 transition-colors"
            >
              <Network size={14} />
              <div className="text-left">
                <div className="font-medium">My graph view</div>
                <div className="text-xs text-gray-500">
                  {PERSONA_GRAPH_LABELS[personaId]}
                </div>
              </div>
            </a>
          </div>

          {/* Sign out */}
          <div className="p-2">
            <button
              onClick={() => {
                setOpen(false);
                if (IS_STATIC) return;
                const keycloakPublicUrl =
                  process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL;
                const logoutUrl = keycloakPublicUrl
                  ? `${keycloakPublicUrl}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(
                      window.location.origin,
                    )}&client_id=${
                      process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ??
                      "health-dataspace-ui"
                    }`
                  : undefined;
                signOut({ callbackUrl: logoutUrl ?? "/" });
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 rounded transition-colors"
            >
              <LogOut size={14} />
              {IS_STATIC ? "Sign out (disabled in demo)" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
