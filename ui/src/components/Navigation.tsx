"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Network,
  BookOpen,
  ShieldCheck,
  User,
  BarChart2,
  Search,
  UserPlus,
  FileKey2,
  Upload,
  Database,
  FileSignature,
  ArrowRightLeft,
  LayoutDashboard,
  ChevronDown,
  Heart,
  Activity,
  FileText,
  Code2,
  Layers,
  ScrollText,
  ClipboardList,
  Edit3,
  Lightbulb,
  FlaskConical,
  Menu,
  X,
} from "lucide-react";
import UserMenu from "./UserMenu";
import { useState, useRef, useEffect } from "react";
import { deriveParticipantType, derivePersonaId } from "@/lib/auth";
import { useDemoPersona } from "@/lib/use-demo-persona";
import type { LucideProps } from "lucide-react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

// ── Types ──────────────────────────────────────────────────────────────────────

type LucideIcon = React.ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
>;

/**
 * Which roles can see this nav item.
 * undefined / empty → public (always visible).
 * "AUTH"           → any authenticated user.
 * string[]         → one of these role codes must be present.
 */
interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: string[] | "AUTH";
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** If set, group is hidden unless user has at least one of these roles. */
  roles?: string[] | "AUTH";
  /** If set, group is hidden when user has any of these roles (persona-specific menus replace it). */
  hideForRoles?: string[];
  links: NavLink[];
}

// ── Cluster 2: Explore ────────────────────────────────────────────────────────
// Public + authenticated mix — shown to everyone but some items filtered
const exploreGroup: NavGroup = {
  label: "Explore",
  icon: Network,
  // DATA_USER sees "My Researches" instead; PATIENT sees "My Health" instead
  hideForRoles: ["DATA_USER", "PATIENT"],
  links: [
    { href: "/graph", label: "Graph Explorer", icon: Network },
    { href: "/catalog", label: "Dataset Catalog", icon: BookOpen },
    {
      href: "/catalog/editor",
      label: "DCAT-AP Editor",
      icon: Edit3,
      roles: ["EDC_ADMIN", "DATA_HOLDER", "EDC_USER_PARTICIPANT"],
    },
    { href: "/patient", label: "Patient Journey", icon: User },
    {
      href: "/analytics",
      label: "OMOP Analytics",
      icon: BarChart2,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY", "EDC_USER_PARTICIPANT"],
    },
    {
      href: "/query",
      label: "NLQ / Federated",
      icon: Search,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
    },
    { href: "/eehrxf", label: "EEHRxF Profiles", icon: Heart },
  ],
};

// ── Cluster 3: Governance ─────────────────────────────────────────────────────
const governanceGroup: NavGroup = {
  label: "Governance",
  icon: ShieldCheck,
  roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
  links: [
    {
      href: "/compliance",
      label: "EHDS Approval",
      icon: ShieldCheck,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
    },
    {
      href: "/compliance/tck",
      label: "Protocol TCK",
      icon: ShieldCheck,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
    },
    {
      href: "/credentials",
      label: "Credentials",
      icon: FileKey2,
      roles: [
        "EDC_ADMIN",
        "DATA_HOLDER",
        "DATA_USER",
        "HDAB_AUTHORITY",
        "TRUST_CENTER_OPERATOR",
        "EDC_USER_PARTICIPANT",
      ],
    },
  ],
};

// ── Cluster 4: Exchange ───────────────────────────────────────────────────────
// Patients are citizens, not active dataspace participants — no data exchange
const exchangeGroup: NavGroup = {
  label: "Exchange",
  icon: ArrowRightLeft,
  roles: [
    "EDC_ADMIN",
    "DATA_HOLDER",
    "HDAB_AUTHORITY",
    "TRUST_CENTER_OPERATOR",
    "EDC_USER_PARTICIPANT",
  ],
  links: [
    {
      href: "/data/share",
      label: "Share Data",
      icon: Upload,
      roles: ["EDC_ADMIN", "DATA_HOLDER", "EDC_USER_PARTICIPANT"],
    },
    {
      href: "/data/discover",
      label: "Discover",
      icon: Database,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
    },
    {
      href: "/negotiate",
      label: "Negotiate",
      icon: FileSignature,
      roles: [
        "EDC_ADMIN",
        "DATA_HOLDER",
        "HDAB_AUTHORITY",
        "TRUST_CENTER_OPERATOR",
        "EDC_USER_PARTICIPANT",
      ],
    },
    {
      href: "/tasks",
      label: "Tasks",
      icon: ClipboardList,
      roles: [
        "EDC_ADMIN",
        "DATA_HOLDER",
        "HDAB_AUTHORITY",
        "TRUST_CENTER_OPERATOR",
        "EDC_USER_PARTICIPANT",
      ],
    },
    {
      href: "/data/transfer",
      label: "Transfer",
      icon: ArrowRightLeft,
      roles: [
        "EDC_ADMIN",
        "DATA_HOLDER",
        "HDAB_AUTHORITY",
        "TRUST_CENTER_OPERATOR",
        "EDC_USER_PARTICIPANT",
      ],
    },
  ],
};

// ── Cluster 4b: My Researches (DATA_USER / researcher role) ─────────────────
// EHDS Art. 46-49 — complete researcher workflow in daily-work order.
// Merges explore + exchange + workflow steps into one logical menu.
const myResearchesGroup: NavGroup = {
  label: "My Researches",
  icon: FlaskConical,
  roles: ["DATA_USER"],
  links: [
    {
      href: "/graph?persona=researcher",
      label: "Research Overview",
      icon: Network,
      roles: ["DATA_USER"],
    },
    {
      href: "/catalog",
      label: "Browse Catalogs",
      icon: BookOpen,
      roles: ["DATA_USER"],
    },
    {
      href: "/data/discover",
      label: "Discover Datasets",
      icon: Search,
      roles: ["DATA_USER"],
    },
    {
      href: "/negotiate",
      label: "Request Access",
      icon: FileSignature,
      roles: ["DATA_USER"],
    },
    {
      href: "/tasks",
      label: "My Applications",
      icon: ClipboardList,
      roles: ["DATA_USER"],
    },
    {
      href: "/data/transfer",
      label: "Retrieve Data",
      icon: ArrowRightLeft,
      roles: ["DATA_USER"],
    },
    {
      href: "/analytics",
      label: "Run Analytics",
      icon: BarChart2,
      roles: ["DATA_USER"],
    },
    {
      href: "/query",
      label: "Query & Export",
      icon: Database,
      roles: ["DATA_USER"],
    },
    {
      href: "/patient",
      label: "Patient Journeys",
      icon: User,
      roles: ["DATA_USER"],
    },
    {
      href: "/eehrxf",
      label: "EEHRxF Profiles",
      icon: Heart,
      roles: ["DATA_USER"],
    },
  ],
};

// ── Cluster 4c: My Health (PATIENT role only) ────────────────────────────────
// EHDS Chapter II Art. 3-12 / GDPR Art. 15-22 — patient primary-use rights
const myHealthGroup: NavGroup = {
  label: "My Health",
  icon: Heart,
  roles: ["PATIENT"],
  links: [
    {
      href: "/patient",
      label: "My Health Records",
      icon: User,
      roles: ["PATIENT"],
    },
    {
      href: "/patient/profile",
      label: "Health Profile & Risks",
      icon: Heart,
      roles: ["PATIENT"],
    },
    {
      href: "/patient/research",
      label: "Research Programs",
      icon: FlaskConical,
      roles: ["PATIENT"],
    },
    {
      href: "/patient/insights",
      label: "Research Insights",
      icon: Lightbulb,
      roles: ["PATIENT"],
    },
  ],
};

// ── Cluster 5: Manage ─────────────────────────────────────────────────────────
const manageGroup: NavGroup = {
  label: "Manage",
  icon: LayoutDashboard,
  roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
  links: [
    {
      href: "/onboarding",
      label: "Onboarding",
      icon: UserPlus,
      roles: ["EDC_ADMIN"],
    },
    {
      href: "/admin",
      label: "Operator Dashboard",
      icon: LayoutDashboard,
      roles: ["EDC_ADMIN"],
    },
    {
      href: "/admin/components",
      label: "EDC Components",
      icon: Activity,
      roles: ["EDC_ADMIN"],
    },
    {
      href: "/admin/tenants",
      label: "Tenants",
      icon: User,
      roles: ["EDC_ADMIN"],
    },
    {
      href: "/admin/policies",
      label: "Policies",
      icon: ShieldCheck,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
    },
    {
      href: "/admin/audit",
      label: "Audit & Provenance",
      icon: ScrollText,
      roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
    },
  ],
};

// ── Cluster 6: Docs ───────────────────────────────────────────────────────────
const docsGroup: NavGroup = {
  label: "Docs",
  icon: FileText,
  links: [
    { href: "/docs", label: "Overview", icon: FileText },
    { href: "/docs/user-guide", label: "User Guide", icon: BookOpen },
    { href: "/docs/developer", label: "Developer Guide", icon: Code2 },
    { href: "/docs/architecture", label: "Architecture", icon: Layers },
  ],
};

const ALL_NAV_GROUPS: NavGroup[] = [
  exploreGroup,
  myResearchesGroup,
  myHealthGroup,
  governanceGroup,
  exchangeGroup,
  manageGroup,
  docsGroup,
];

// ── Role-filter helpers ────────────────────────────────────────────────────────

function canSee(
  itemRoles: string[] | "AUTH" | undefined,
  userRoles: string[],
  isAuthenticated: boolean,
): boolean {
  if (!itemRoles) return true; // public
  if (itemRoles === "AUTH") return isAuthenticated;
  // Include derived DATA_HOLDER / DATA_USER based on EDC_USER_PARTICIPANT presence
  return itemRoles.some((r) => userRoles.includes(r));
}

/** Filters a group's links and the group itself based on the user's roles. */
function filterGroup(
  group: NavGroup,
  userRoles: string[],
  isAuthenticated: boolean,
): NavGroup | null {
  if (!canSee(group.roles, userRoles, isAuthenticated)) return null;
  // Hide group when user has a role that gets a dedicated menu instead
  if (group.hideForRoles?.some((r) => userRoles.includes(r))) return null;
  const visibleLinks = group.links.filter((l) =>
    canSee(l.roles, userRoles, isAuthenticated),
  );
  if (visibleLinks.length === 0) return null;
  return { ...group, links: visibleLinks };
}

// ── NavDropdown ───────────────────────────────────────────────────────────────

function NavDropdown({
  group,
  onNavigate,
}: {
  group: NavGroup;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isActive = group.links.some((l) => pathname?.startsWith(l.href));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 px-3 py-2 rounded text-sm transition-colors touch-target-sm ${
          isActive
            ? "bg-layer1 text-white"
            : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
        }`}
      >
        <group.icon size={15} aria-hidden="true" />
        {group.label}
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[170px]"
          role="menu"
        >
          {group.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                pathname?.startsWith(l.href)
                  ? "text-layer2 bg-gray-700/50"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              <l.icon size={14} aria-hidden="true" />
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Navigation ────────────────────────────────────────────────────────────────

export default function Navigation() {
  const { data: session, status } = useSession();
  // Always call useDemoPersona — hook rules require unconditional calls.
  // In live mode the return value is ignored.
  const demoPersona = useDemoPersona();
  const [mobileOpen, setMobileOpen] = useState(false);

  // In static demo mode, derive everything from the stored persona.
  // In live mode, use the NextAuth session as before.
  const isAuthenticated = IS_STATIC
    ? true
    : status === "authenticated" && !!session;

  const baseRoles: string[] = IS_STATIC
    ? [...demoPersona.roles]
    : (session as { roles?: string[] })?.roles ?? [];

  const username = IS_STATIC
    ? demoPersona.username
    : session?.user?.name ?? session?.user?.email ?? "";

  const participantType = deriveParticipantType(baseRoles, username);
  const _personaId = derivePersonaId(baseRoles, username);

  // Augment roles with derived sub-type so filter helpers work
  const effectiveRoles =
    participantType && !baseRoles.includes(participantType)
      ? [...baseRoles, participantType]
      : baseRoles;

  // Filter groups/items for the current user
  const visibleGroups = ALL_NAV_GROUPS.map((g) =>
    filterGroup(g, effectiveRoles, isAuthenticated),
  ).filter((g): g is NavGroup => g !== null);

  // Close mobile nav on route change
  const pathname = usePathname();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav
      className="bg-gray-900 border-b border-gray-700"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center gap-1 px-4 py-2">
        <Link
          href="/"
          className="mr-4 font-semibold text-layer1 tracking-wide text-sm hover:text-white transition-colors"
        >
          Health Dataspace
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {visibleGroups.map((g) => (
            <NavDropdown key={g.label} group={g} />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <UserMenu />
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 touch-target"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <X size={22} aria-hidden="true" />
            ) : (
              <Menu size={22} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div
          id="mobile-nav"
          className="md:hidden border-t border-gray-700 bg-gray-900 px-4 py-3 space-y-1 animate-fade-in-up"
        >
          {visibleGroups.map((g) => (
            <div key={g.label} className="mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">
                {g.label}
              </span>
              <div className="mt-1 space-y-0.5">
                {g.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors touch-target-sm"
                  >
                    <l.icon size={16} aria-hidden="true" />
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
