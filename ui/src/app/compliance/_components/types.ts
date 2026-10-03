import {
  type ApplicationClock,
  type ApplicationItems,
  type Completeness,
} from "@/lib/permits";

export interface TrustCenter {
  name: string;
  operatedBy: string;
  country: string;
  status: string;
  protocol: string;
  did: string;
  hdabApprovalId: string | null;
  hdabApprovalStatus: string | null;
  datasetCount: number;
  recognisedCountries: string[];
  activeRpsnCount: number;
}

export interface SpeSession {
  sessionId: string;
  studyId: string;
  status: string;
  createdBy: string;
  createdAt: string;
  kAnonymityThreshold: number;
  outputPolicy: string;
}

export interface Consumer {
  id: string;
  name: string;
  type: string;
}

export interface DatasetOption {
  id: string;
  title: string;
}

export interface MatrixRow {
  consumerId: string;
  consumerName: string;
  consumerType: string;
  hasApplication: boolean;
  applicationStatus: string | null;
  hasApproval: boolean;
  approvalStatus: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  hasContract: boolean;
  ehdsArticle: string | null;
}

/**
 * The application behind a matrix row and the Art. 68(4) clock on it. Merged
 * into MatrixRow; every field is null for a participant without an application.
 */
export interface MatrixRow extends ApplicationItems, Partial<ApplicationClock> {
  applicationId?: string | null;
  applicationName?: string | null;
  applicantCategory?: string | null;
  completeness?: Completeness | null;
  completedAt?: string | null;
  extensionReason?: string | null;
  incompleteNoticeAt?: string | null;
  incompleteReason?: string | null;
  statisticalAlternativeOffered?: boolean | null;
  submittedAt?: string | null;
  requestedPurpose?: string | null;
  requestedDatasetId?: string | null;
  requestedDatasetTitle?: string | null;
  justification?: string | null;
  ethicsCommitteeRef?: string | null;
  approvalId?: string | null;
  decidedAt?: string | null;
  validUntil?: string | null;
  decisionJustification?: string | null;
  decisionDue?: string | null;
  daysToDecision?: number | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface DecisionResult {
  permitId: string;
  decision: "APPROVED" | "REJECTED";
  validUntil: string | null;
  publishBy: string;
  article: string;
  statisticalAlternative?: boolean;
}

interface ChainEntry {
  consumer: string;
  applicationId: string;
  applicationStatus: string;
  approvalId: string;
  approvalStatus: string;
  ehdsArticle: string;
  dataset: string;
  contract: string;
}

export interface Result {
  compliant: boolean;
  chain: ChainEntry[];
}

export interface Credential {
  credentialId: string;
  credentialType: string;
  subjectDid: string;
  issuerDid: string;
  status: string;
  participantRole: string | null;
  holderName: string | null;
  holderType: string | null;
  issuedAt: string;
  expiresAt: string;
  purpose: string | null;
  datasetId: string | null;
  completeness: number | null;
  conformance: number | null;
  timeliness: number | null;
}

/** Compliance status for a single participant */
export type ComplianceLevel =
  | "full"
  | "approved"
  | "pending"
  | "rejected"
  | "review"
  | "governance"
  | "revoked"
  | "none";
