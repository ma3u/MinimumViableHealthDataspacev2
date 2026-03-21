"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut, User, Shield } from "lucide-react";
import { useState, useRef, useEffect } from "react";

/** Role badge colors */
const roleBadge: Record<string, string> = {
  EDC_ADMIN: "bg-red-700 text-red-100",
  EDC_USER_PARTICIPANT: "bg-blue-700 text-blue-100",
  HDAB_AUTHORITY: "bg-amber-700 text-amber-100",
};

/** Mock session used in the static GitHub Pages demo */
const DEMO_SESSION = {
  user: { name: "edcadmin", email: "edcadmin@alpha-klinik.de" },
  roles: ["EDC_ADMIN"],
};

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

export default function UserMenu() {
  const { data: liveSession, status: liveStatus } = useSession();
  const session = IS_STATIC ? DEMO_SESSION : liveSession;
  const status = IS_STATIC ? "authenticated" : liveStatus;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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
        <span className="animate-pulse">...</span>
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

  const displayRoles = ((session as typeof DEMO_SESSION).roles ?? []).filter(
    (r: string) => r in roleBadge,
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-800 transition-colors"
      >
        <Shield size={15} className={IS_STATIC ? "text-amber-400" : ""} />
        <span className="max-w-[120px] truncate">
          {session.user?.name ?? session.user?.email ?? "User"}
          {IS_STATIC && (
            <span className="ml-1 text-[10px] text-amber-400">(Demo)</span>
          )}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-gray-700">
            <p className="text-sm text-white font-medium truncate">
              {session.user?.name}
              {IS_STATIC && (
                <span className="ml-2 text-[10px] text-amber-400 font-normal">
                  demo
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {session.user?.email}
            </p>
          </div>

          {displayRoles.length > 0 && (
            <div className="p-3 border-b border-gray-700">
              <p className="text-xs text-gray-500 mb-1.5">Roles</p>
              <div className="flex flex-wrap gap-1">
                {displayRoles.map((role: string) => (
                  <span
                    key={role}
                    className={`text-xs px-2 py-0.5 rounded ${
                      roleBadge[role] ?? "bg-gray-600 text-gray-200"
                    }`}
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="p-2">
            <button
              onClick={() => {
                setOpen(false);
                if (IS_STATIC) return; // no-op in demo mode
                // Build Keycloak end-session URL to fully logout
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
