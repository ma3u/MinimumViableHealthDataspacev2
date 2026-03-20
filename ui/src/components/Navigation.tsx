"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<any>;
}

interface NavGroup {
  label: string;
  icon: React.ComponentType<any>;
  links: NavLink[];
}

/* ── Cluster 1: Get Started ── */
const getStartedGroup: NavGroup = {
  label: "Get Started",
  icon: UserPlus,
  links: [
    { href: "/onboarding", label: "Onboarding", icon: UserPlus },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

/* ── Cluster 2: Explore ── */
const exploreGroup: NavGroup = {
  label: "Explore",
  icon: Network,
  links: [
    { href: "/graph", label: "Graph Explorer", icon: Network },
    { href: "/catalog", label: "Dataset Catalog", icon: BookOpen },
    { href: "/catalog/editor", label: "DCAT-AP Editor", icon: Edit3 },
    { href: "/patient", label: "Patient Journey", icon: User },
    { href: "/analytics", label: "OMOP Analytics", icon: BarChart2 },
    { href: "/query", label: "NLQ / Federated", icon: Search },
    { href: "/eehrxf", label: "EEHRxF Profiles", icon: Heart },
  ],
};

/* ── Cluster 3: Governance ── */
const governanceGroup: NavGroup = {
  label: "Governance",
  icon: ShieldCheck,
  links: [
    { href: "/compliance", label: "EHDS Approval", icon: ShieldCheck },
    { href: "/compliance/tck", label: "Protocol TCK", icon: ShieldCheck },
    { href: "/credentials", label: "Credentials", icon: FileKey2 },
  ],
};

/* ── Cluster 4: Exchange ── */
const exchangeGroup: NavGroup = {
  label: "Exchange",
  icon: ArrowRightLeft,
  links: [
    { href: "/data/share", label: "Share Data", icon: Upload },
    { href: "/data/discover", label: "Discover", icon: Database },
    { href: "/negotiate", label: "Negotiate", icon: FileSignature },
    { href: "/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/data/transfer", label: "Transfer", icon: ArrowRightLeft },
  ],
};

/* ── Cluster 5: Manage ── */
const manageGroup: NavGroup = {
  label: "Manage",
  icon: LayoutDashboard,
  links: [
    { href: "/admin", label: "Operator Dashboard", icon: LayoutDashboard },
    { href: "/admin/components", label: "EDC Components", icon: Activity },
    { href: "/admin/tenants", label: "Tenants", icon: User },
    { href: "/admin/policies", label: "Policies", icon: ShieldCheck },
    { href: "/admin/audit", label: "Audit & Provenance", icon: ScrollText },
  ],
};

/* ── Cluster 6: Docs ── */
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

const navGroups: NavGroup[] = [
  getStartedGroup,
  exploreGroup,
  governanceGroup,
  exchangeGroup,
  manageGroup,
  docsGroup,
];

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

export default function Navigation() {
  const _pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-900 border-b border-gray-700">
      <Link
        href="/"
        className="mr-4 font-semibold text-layer1 tracking-wide text-sm hover:text-white transition-colors"
      >
        Health Dataspace
      </Link>
      {navGroups.map((g) => (
        <NavDropdown key={g.label} group={g} />
      ))}
      <div className="ml-auto">
        <UserMenu />
      </div>
    </nav>
  );
}
