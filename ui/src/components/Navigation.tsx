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
} from "lucide-react";
import UserMenu from "./UserMenu";

const links = [
  { href: "/graph", label: "Graph Explorer", icon: Network },
  { href: "/catalog", label: "Dataset Catalog", icon: BookOpen },
  { href: "/compliance", label: "EHDS Compliance", icon: ShieldCheck },
  { href: "/patient", label: "Patient Journey", icon: User },
  { href: "/analytics", label: "OMOP Analytics", icon: BarChart2 },
  { href: "/query", label: "NLQ / Federated", icon: Search },
];

export default function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-900 border-b border-gray-700">
      <span className="mr-4 font-semibold text-layer1 tracking-wide text-sm">
        Health Dataspace
      </span>
      {links.map(({ href, label, icon: Icon }) => (
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
      <div className="ml-auto">
        <UserMenu />
      </div>
    </nav>
  );
}
