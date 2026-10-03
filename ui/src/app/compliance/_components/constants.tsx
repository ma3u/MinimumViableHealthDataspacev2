"use client";

import type { ComplianceLevel } from "./types";

export const COMPLIANCE_LABELS: Record<ComplianceLevel, string> = {
  full: "Compliant",
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  review: "Under Review",
  governance: "HDAB Authority",
  revoked: "Revoked",
  none: "No chain",
};
