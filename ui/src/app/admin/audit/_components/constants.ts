import {
  ScrollText,
  ArrowRightLeft,
  FileSignature,
  ShieldCheck,
  Eye,
  AlertTriangle,
} from "lucide-react";
import type { AuditFilters, AuditType } from "./types";

export const TABS: {
  key: AuditType;
  label: string;
  icon: typeof ScrollText;
}[] = [
  { key: "all", label: "Overview", icon: ScrollText },
  { key: "transfers", label: "Transfers", icon: ArrowRightLeft },
  { key: "negotiations", label: "Negotiations", icon: FileSignature },
  { key: "credentials", label: "Credentials", icon: ShieldCheck },
  { key: "accesslogs", label: "Access Logs", icon: Eye },
  { key: "supervision", label: "Supervision", icon: AlertTriangle },
];

export const TRANSFER_STATUSES = ["COMPLETED", "IN_PROGRESS", "ERROR"];

export const NEGOTIATION_STATUSES = [
  "CONFIRMED",
  "FINALIZED",
  "IN_PROGRESS",
  "TERMINATED",
];

export const EMPTY_FILTERS: AuditFilters = {
  status: "",
  dateFrom: "",
  dateTo: "",
  consumerDid: "",
  providerDid: "",
  crossBorder: "",
};
