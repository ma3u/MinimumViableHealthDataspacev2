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
  Settings,
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
} from "lucide-react";
import UserMenu from "./UserMenu";
import { useState, useRef, useEffect } from "react";
import { deriveParticipantType, derivePersonaId } from "@/lib/auth";
import type { LucideProps } from "lucide-react";

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
  links: NavLink[];
}

// ── Cluster 1: Get Started ─────────────────────────────────────────────────────
const getStartedGroup: NavGroup = {
  label: "Get Started",
  icon: UserPlus,
  roles: "AUTH",
  links: [
    { href: "/onboarding", label: "Onboarding", icon: UserPlus, roles: "AUTH" },
    { href: "/settings", label: "Settings", icon: Settings, roles: "AUTH" },
  ],
};

// ── Cluster 2: Explore ────────────────────────────────────────────────────────
// Public + authenticated mix — shown to everyone but some items filtered
const exploreGroup: NavGroup = {
  label: "Explore",
  icon: Network,
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
      roles: [
        "EDC_ADMIN",
        "DATA_USER",
        "HDAB_AUTHORITY",
        "EDC_USER_PARTICIPANT",
      ],
    },
    {
      href: "/query",
      label: "NLQ / Federated",
      icon: Search,
      roles: ["EDC_ADMIN", "DATA_USER", "HDAB_AUTHORITY"],
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
      roles: "AUTH",
    },
  ],
};

// ── Cluster 4: Exchange ───────────────────────────────────────────────────────
const exchangeGroup: NavGroup = {
  label: "Exchange",
  icon: ArrowRightLeft,
  roles: "AUTH",
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
      roles: ["EDC_ADMIN", "DATA_USER", "HDAB_AUTHORITY"],
    },
    {
      href: "/negotiate",
      label: "Negotiate",
      icon: FileSignature,
      roles: "AUTH",
    },
    {
      href: "/tasks",
      label: "Tasks",
      icon: ClipboardList,
      roles: "AUTH",
    },
    {
      href: "/data/transfer",
      label: "Transfer",
      icon: ArrowRightLeft,
      roles: "AUTH",
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
  getStartedGroup,
  exploreGroup,
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
  const visibleLinks = group.links.filter((l) =>
    canSee(l.roles, userRoles, isAuthenticated),
  );
  if (visibleLinks.length === 0) return null;
  return { ...group, links: visibleLinks };
}

// ── NavDropdown ───────────────────────────────────────────────────────────────

function NavDropdown({ group }: { group: NavGroup }) {
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
        className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors ${
          isActive
            ? "bg-layer1 text-white"
            : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
        }`}
      >
        <group.icon size={15} />
        {group.label}
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[170px]">
          {group.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                pathname?.startsWith(l.href)
                  ? "text-layer2 bg-gray-700/50"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              <l.icon size={14} />
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
  const isAuthenticated = status === "authenticated" && !!session;

  // Build the effective role list including derived sub-types
  const baseRoles = (session as { roles?: string[] })?.roles ?? [];
  const username = session?.user?.name ?? session?.user?.email ?? "";
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

  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-900 border-b border-gray-700">
      <Link
        href="/"
        className="mr-4 font-semibold text-layer1 tracking-wide text-sm hover:text-white transition-colors"
      >
        Health Dataspace
      </Link>
      {visibleGroups.map((g) => (
        <NavDropdown key={g.label} group={g} />
      ))}
      <div className="ml-auto">
        <UserMenu />
      </div>
    </nav>
  );
}
