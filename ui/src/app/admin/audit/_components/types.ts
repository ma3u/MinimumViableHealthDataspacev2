// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditType =
  | "all"
  | "transfers"
  | "negotiations"
  | "credentials"
  | "accesslogs"
  | "supervision";

/** A finding of non-compliance (Art. 63) as the audit view lists it. */
interface FindingRow {
  findingId: string;
  partyId: string | null;
  partyName: string | null;
  permitId: string | null;
  description: string | null;
  gdprBreach: boolean | null;
  supervisoryAuthorityInformed: boolean | null;
  status: string | null;
  notifiedAt: string | null;
  respondBy: string | null;
  respondedAt: string | null;
  views: string | null;
  measure: string | null;
  measureNote: string | null;
  closedAt: string | null;
  revokedPermit: string | null;
}

interface InformationRequestRow {
  requestId: string;
  partyId: string | null;
  partyName: string | null;
  permitId: string | null;
  findingId: string | null;
  question: string | null;
  status: string | null;
  requestedAt: string | null;
  answerBy: string | null;
  answeredAt: string | null;
  answer: string | null;
}

export interface RetentionState {
  policy: { months: number; article: string; rule: string };
  events: {
    total: number;
    withRetention: number;
    expired: number;
    protectedCount: number;
    oldest: string | null;
  };
  transfers: {
    total: number;
    withRetention: number;
    expired: number;
    protectedCount: number;
    oldest: string | null;
  };
}

export interface Participant {
  did: string;
  name: string;
  country: string;
  complianceOfficerName?: string;
  complianceOfficerEmail?: string;
  complianceOfficerPhone?: string;
  edcEndpoint?: string;
}

export interface AuditFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  consumerDid: string;
  providerDid: string;
  crossBorder: string; // "" | "true" | "false"
}

interface TransferRow {
  id: string;
  status: string;
  timestamp?: string;
  transferDate?: string;
  consumerDid?: string;
  consumerName?: string;
  consumerCountryCode?: string;
  consumerComplianceName?: string;
  consumerComplianceEmail?: string;
  providerDid?: string;
  providerName?: string;
  providerCountryCode?: string;
  providerComplianceName?: string;
  providerComplianceEmail?: string;
  asset?: string;
  assetId?: string;
  protocol?: string;
  byteSize?: number;
  crossBorder?: boolean;
  policyId?: string;
  contentHash?: string;
  errorMessage?: string;
  // enriched fields
  direction?: string; // "OUTGOING" | "INCOMING"
  purposeOfSharing?: string;
  legalBasis?: string;
  edcProviderEndpoint?: string;
  edcConsumerEndpoint?: string;
  edcTransferId?: string;
  accessCount?: number;
  accessLogCount?: number;
}

interface NegotiationRow {
  id: string;
  status: string;
  timestamp?: string;
  negotiationDate?: string;
  consumerDid?: string;
  consumerName?: string;
  consumerCountryCode?: string;
  consumerComplianceName?: string;
  consumerComplianceEmail?: string;
  consumerEdcEndpoint?: string;
  providerDid?: string;
  providerName?: string;
  providerCountryCode?: string;
  providerComplianceName?: string;
  providerComplianceEmail?: string;
  providerEdcEndpoint?: string;
  asset?: string;
  assetId?: string;
  crossBorder?: boolean;
  policyId?: string;
  contentHash?: string;
  contractId?: string;
  // policy details
  policyPurpose?: string;
  policyLegalBasis?: string;
  policyPermittedUses?: string;
  policyProhibitedUses?: string;
  policyDataMinimisation?: string;
  policyRetentionDays?: number;
  accessCount?: number;
  accessLogCount?: number;
  lastAccessAt?: string;
}

interface CredentialRow {
  participant?: string;
  credentialType?: string;
  type?: string;
  issuedAt?: string;
  issuanceDate?: string;
  subjectDid?: string;
}

interface AccessLogRow {
  id?: string;
  contractId?: string;
  transferId?: string;
  consumerDid?: string;
  consumerName?: string;
  consumerCountry?: string;
  providerDid?: string;
  providerName?: string;
  providerCountry?: string;
  assetId?: string;
  assetTitle?: string;
  accessedAt?: string;
  accessType?: string; // "INITIAL_TRANSFER" | "QUERY" | "DATA_READ"
  bytesAccessed?: number;
  purpose?: string;
  // The recorder's own fields (issue #206): what was asked, under which permit
  permitId?: string | null;
  permitStatus?: string | null;
  permitValidUntil?: string | null;
  name?: string | null;
  endpoint?: string | null;
  method?: string | null;
  statusCode?: number | null;
  resultCount?: number | null;
  durationMs?: number | null;
  contentType?: string | null;
  protocol?: string | null;
  errorMessage?: string | null;
  demo?: boolean | null;
}

export interface AuditData {
  type: string;
  limit: number;
  transfers?: TransferRow[];
  negotiations?: NegotiationRow[];
  credentials?: CredentialRow[];
  accesslogs?: AccessLogRow[];
  findings?: FindingRow[];
  informationRequests?: InformationRequestRow[];
  summary?: {
    nodeCounts: Record<string, number>;
    accessByConsumer?: {
      consumerName: string;
      totalAccesses: number;
      totalBytes: number;
      lastAccess: string;
    }[];
  };
}
