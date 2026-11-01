"use client";

import { Mail } from "lucide-react";
import { useT } from "@/lib/i18n/translate";

export function ComplianceButton({
  name,
  email,
}: {
  name?: string;
  email?: string;
}) {
  const t = useT("admin");
  if (!email) return null;
  return (
    <a
      href={`mailto:${email}?subject=Data Access Restriction Request`}
      title={t("Contact compliance officer: {name}", { name: name ?? email })}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] bg-(--role-hdab-bg) text-(--role-hdab-text) border border-(--role-hdab-border) hover:opacity-80 transition-opacity"
    >
      <Mail size={9} /> {name ?? email}
    </a>
  );
}
