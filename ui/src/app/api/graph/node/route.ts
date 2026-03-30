import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/**
 * User-friendly property labels per node type.
 * Keys are Neo4j property names, values are display labels.
 * Properties not listed here are still returned but with auto-formatted keys.
 */
const PROPERTY_LABELS: Record<string, Record<string, string>> = {
  Participant: {
    participantId: "ID",
    name: "Name",
    legalName: "Legal Name",
    participantType: "Type",
    jurisdiction: "Country",
    role: "Role",
    did: "DID",
  },
  DataProduct: {
    productId: "ID",
    name: "Name",
    title: "Title",
    productType: "Type",
    sensitivity: "Sensitivity",
  },
  Contract: {
    contractId: "Contract ID",
    name: "Name",
    agreementDate: "Agreement Date",
    validUntil: "Valid Until",
    usagePurpose: "Purpose",
    accessType: "Access Type",
  },
  DataTransfer: {
    id: "Transfer ID",
    name: "Name",
    status: "Status",
  },
  TransferEvent: {
    name: "Description",
    consumerDid: "Data Consumer",
    providerDid: "Data Provider",
    contractId: "Contract",
    datasetId: "Dataset",
    purpose: "Purpose",
    endpoint: "Endpoint",
    method: "Method",
    protocol: "Protocol",
    contentType: "Content Type",
    resultCount: "Results",
    responseBytes: "Response Size (bytes)",
    duration: "Duration (ms)",
    timestamp: "Timestamp",
    statusCode: "Status Code",
    errorMessage: "Error",
    eventId: "Event ID",
  },
  VerifiableCredential: {
    credentialId: "Credential ID",
    credentialType: "Type",
    issuerDid: "Issuer",
    subjectDid: "Subject",
    status: "Status",
    format: "Format",
    issuedAt: "Issued",
    expiresAt: "Expires",
    participantRole: "Participant Role",
    purpose: "Purpose",
    permittedUses: "Permitted Uses",
    prohibitedUses: "Prohibited Uses",
    completeness: "Completeness",
    conformance: "Conformance",
    timeliness: "Timeliness",
    jurisdiction: "Jurisdiction",
    ehdsArticle: "EHDS Article",
  },
  HealthDataset: {
    datasetId: "Dataset ID",
    name: "Name",
    title: "Title",
    healthSensitivity: "Sensitivity",
    permittedPurpose: "Permitted Purposes",
    license: "License",
    publisher: "Publisher",
  },
  Distribution: {
    distributionId: "Distribution ID",
    name: "Name",
    title: "Title",
    format: "Format",
    conformsTo: "Conforms To",
    accessUrl: "Access URL",
  },
  HDABApproval: {
    approvalId: "Approval ID",
    name: "Name",
    applicationId: "Application ID",
    approvedAt: "Approved At",
    validUntil: "Valid Until",
    permittedPurpose: "Purpose",
    conditions: "Conditions",
    hdabOfficer: "Officer",
    legalBasisArticle: "Legal Basis",
  },
  AccessApplication: {
    applicationId: "Application ID",
    name: "Name",
    applicantId: "Applicant",
    datasetId: "Dataset",
    requestedPurpose: "Purpose",
    submittedAt: "Submitted",
    status: "Status",
    justification: "Justification",
  },
  ContractNegotiation: {
    id: "Negotiation ID",
    name: "Name",
    status: "Status",
  },
  Patient: {
    resourceId: "Resource ID",
    patientId: "Patient ID",
    name: "Name",
    birthDate: "Birth Date",
    gender: "Gender",
    city: "City",
    country: "Country",
  },
  Condition: {
    resourceId: "Resource ID",
    code: "Code",
    display: "Diagnosis",
    onset: "Onset Date",
  },
  Observation: {
    resourceId: "Resource ID",
    code: "Code",
    display: "Measurement",
    value: "Value",
    unit: "Unit",
    effectiveDate: "Date",
  },
  MedicationRequest: {
    resourceId: "Resource ID",
    medicationCode: "Code",
    display: "Medication",
  },
  Encounter: {
    resourceId: "Resource ID",
    encounterDate: "Date",
    class: "Class",
    status: "Status",
  },
  SnomedConcept: {
    conceptId: "SNOMED ID",
    code: "Code",
    display: "Term",
  },
  ICD10Code: {
    code: "ICD-10 Code",
    display: "Description",
  },
  LoincCode: {
    code: "LOINC Code",
    display: "Description",
  },
  RxNormConcept: {
    code: "RxNorm Code",
    display: "Drug Name",
    name: "Name",
  },
  TrustCenter: {
    name: "Name",
    did: "DID",
    jurisdiction: "Jurisdiction",
  },
  SPESession: {
    sessionId: "Session ID",
    studyId: "Study ID",
    status: "Status",
    createdAt: "Created",
  },
  PatientConsent: {
    consentId: "Consent ID",
    studyId: "Study ID",
    status: "Status",
    revoked: "Revoked",
    grantedAt: "Granted",
  },
  ResearchPseudonym: {
    rpsnId: "Pseudonym ID",
    studyId: "Study ID",
    revoked: "Revoked",
  },
  OMOPPerson: {
    personId: "Person ID",
    name: "Name",
    genderConceptId: "Gender",
    yearOfBirth: "Year of Birth",
  },
};

/** Properties to hide from display (internal Neo4j metadata). */
const HIDDEN_PROPERTIES = new Set(["elementId", "__typename", "_labels"]);

/**
 * Auto-format a camelCase property key into a human-readable label.
 * e.g. "senderDid" → "Sender Did", "contractId" → "Contract Id"
 */
function autoLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * GET /api/graph/node?id=<elementId>
 *
 * Returns all properties of a single node plus its label and
 * user-friendly property metadata for the detail panel.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get("id");
  if (!nodeId) {
    return NextResponse.json(
      { error: "Missing ?id= parameter" },
      { status: 400 },
    );
  }

  try {
    const rows = await runQuery<{
      labels: string[];
      props: Record<string, unknown>;
    }>(
      `MATCH (n)
       WHERE elementId(n) = $nodeId
       RETURN labels(n) AS labels, properties(n) AS props`,
      { nodeId },
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const { labels, props } = rows[0];
    const primaryLabel = labels[0] ?? "Node";
    const labelMap = PROPERTY_LABELS[primaryLabel] ?? {};

    // Build formatted properties array
    const properties: Array<{
      key: string;
      label: string;
      value: string;
    }> = [];

    // First add properties in the defined order for this label type
    for (const [propKey, displayLabel] of Object.entries(labelMap)) {
      if (props[propKey] != null) {
        properties.push({
          key: propKey,
          label: displayLabel,
          value: formatValue(props[propKey]),
        });
      }
    }

    // Then add remaining properties not yet included
    for (const [key, value] of Object.entries(props)) {
      if (HIDDEN_PROPERTIES.has(key)) continue;
      if (labelMap[key]) continue; // already added above
      if (value == null) continue;
      properties.push({
        key,
        label: autoLabel(key),
        value: formatValue(value),
      });
    }

    return NextResponse.json({
      id: nodeId,
      labels,
      primaryLabel,
      properties,
    });
  } catch (err) {
    console.error("GET /api/graph/node error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Neo4j integer objects have .low/.high properties
    if ("low" in obj && "high" in obj) return String(obj.low);
    // Neo4j DateTime objects
    if ("year" in obj && "month" in obj && "day" in obj) {
      const y = obj.year,
        m = obj.month,
        d = obj.day;
      const h = obj.hour ?? 0,
        min = obj.minute ?? 0;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(
        2,
        "0",
      )} ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    return JSON.stringify(v);
  }
  return String(v);
}
