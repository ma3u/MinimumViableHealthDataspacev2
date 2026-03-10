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
  Menu,
  Heart,
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

const mainLinks: NavLink[] = [
  { href: "/graph", label: "Graph Explorer", icon: Network },
  { href: "/catalog", label: "Dataset Catalog", icon: BookOpen },
  { href: "/patient", label: "Patient Journey", icon: User },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/query", label: "NLQ / Federated", icon: Search },
];

const complianceLinks: NavLink[] = [
  { href: "/compliance", label: "EHDS Approval", icon: ShieldCheck },
  { href: "/compliance/tck", label: "Protocol TCK", icon: ShieldCheck },
];

const additionalLinks: NavLink[] = [
  { href: "/eehrxf", label: "EEHRxF Profiles", icon: Heart },
];

const portalGroups: NavGroup[] = [
  {
    label: "Onboarding",
    icon: UserPlus,
    links: [
      { href: "/onboarding", label: "Register", icon: UserPlus },
      { href: "/onboarding/status", label: "Status", icon: ShieldCheck },
      { href: "/credentials", label: "Credentials", icon: FileKey2 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Data Exchange",
    icon: Database,
    links: [
      { href: "/data/share", label: "Share Data", icon: Upload },
      { href: "/data/discover", label: "Discover", icon: Database },
      { href: "/negotiate", label: "Negotiate", icon: FileSignature },
      { href: "/data/transfer", label: "Transfer", icon: ArrowRightLeft },
    ],
  },
  {
    label: "Admin",
    icon: LayoutDashboard,
    links: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tenants", label: "Tenants", icon: User },
      { href: "/admin/policies", label: "Policies", icon: ShieldCheck },
      { href: "/admin/audit", label: "Audit", icon: Search },
    ],
  },
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
        <div className="absolute top-full left-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[160px]">
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

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const allMoreLinks = [...complianceLinks, ...additionalLinks];
  const isActive = allMoreLinks.some((l) => pathname?.startsWith(l.href));

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
        className={`flex items-center gap-1 px-2 py-1.5 rounded transition-colors ${
          isActive
            ? "text-layer1"
            : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
        }`}
        title="More pages"
      >
        <Menu size={16} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px]">
          {/* Compliance section */}
          <div className="px-2 py-1.5 border-b border-gray-700">
            <div className="text-xs font-semibold text-gray-500 uppercase px-1 mb-1">
              Compliance
            </div>
            {complianceLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
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

          {/* Additional section */}
          <div className="px-2 py-1.5">
            <div className="text-xs font-semibold text-gray-500 uppercase px-1 mb-1">
              Additional
            </div>
            {additionalLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
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
        </div>
      )}
    </div>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-900 border-b border-gray-700">
      <span className="mr-4 font-semibold text-layer1 tracking-wide text-sm">
        Health Dataspace
      </span>
      {mainLinks.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            pathname?.startsWith(href)
              ? "bg-layer1 text-white"
              : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
          }`}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
      <span className="w-px h-5 bg-gray-700 mx-1" />
      {portalGroups.map((g) => (
        <NavDropdown key={g.label} group={g} />
      ))}
      <MoreMenu />
      <div className="ml-auto">
        <UserMenu />
      </div>
    </nav>
  );
}
