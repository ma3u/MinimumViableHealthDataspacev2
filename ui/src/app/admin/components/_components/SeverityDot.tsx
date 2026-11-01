"use client";

import { SEVERITY_STYLES } from "./constants";
import type { Severity } from "./types";
import { useT } from "@/lib/i18n/translate";

export function SeverityDot({ severity }: { severity: Severity }) {
  const t = useT("admin");
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full inline-block ${SEVERITY_STYLES[severity].dot}`}
      title={t(severity)}
    />
  );
}
