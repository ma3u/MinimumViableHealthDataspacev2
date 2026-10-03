"use client";

import type { ComplianceLevel, MatrixRow } from "./types";

export function rowKey(
  row: Pick<MatrixRow, "applicationId" | "consumerId">,
): string {
  return row.applicationId ?? row.consumerId;
}

export function isUndecided(row: MatrixRow): boolean {
  return (
    row.hasApplication &&
    !row.hasApproval &&
    !["APPROVED", "REJECTED", "REVOKED"].includes(
      (row.applicationStatus ?? "").toUpperCase(),
    )
  );
}

export function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function complianceLevel(row: MatrixRow): ComplianceLevel {
  // HDAB authorities review others — they don't submit applications
  if (row.consumerType === "HDAB" && !row.hasApplication) return "governance";
  if (row.approvalStatus === "REVOKED" || row.applicationStatus === "REVOKED") {
    return "revoked";
  }
  if (row.approvalStatus === "REJECTED" || row.applicationStatus === "REJECTED")
    return "rejected";
  if (row.applicationStatus === "UNDER_REVIEW") return "review";
  if (row.applicationStatus === "PENDING") return "pending";
  if (row.hasApproval && row.datasetId && row.hasContract) return "full";
  if (row.hasApproval && row.datasetId) return "approved";
  if (row.hasApplication) return "pending";
  return "none";
}
