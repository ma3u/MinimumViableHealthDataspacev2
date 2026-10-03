"use client";

import { SEVERITY_STYLES } from "./constants";
import type { Severity } from "./types";

export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full inline-block ${SEVERITY_STYLES[severity].dot}`}
      title={severity}
    />
  );
}
