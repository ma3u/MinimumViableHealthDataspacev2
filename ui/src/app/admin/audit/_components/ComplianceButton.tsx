"use client";

import { Mail } from "lucide-react";

export function ComplianceButton({
  name,
  email,
}: {
  name?: string;
  email?: string;
}) {
  if (!email) return null;
  return (
    <a
      href={`mailto:${email}?subject=Data Access Restriction Request`}
      title={`Contact compliance officer: ${name ?? email}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border border-[var(--role-hdab-border)] hover:opacity-80 transition-opacity"
    >
      <Mail size={9} /> {name ?? email}
    </a>
  );
}
