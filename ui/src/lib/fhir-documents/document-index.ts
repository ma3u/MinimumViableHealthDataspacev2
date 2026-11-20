import { LAB_PROFILES, type LabReportInput } from "./lab-report";
import { EPS_PROFILES } from "./patient-summary";

/** One document a record yields, and where to fetch it. */
export interface DocumentIndexEntry {
  type: "patient-summary" | "lab-report";
  title: string;
  profile: string;
  href: string;
  reportId?: string;
  date?: string;
  performer?: string | null;
  results?: number;
}

export interface DocumentIndex {
  patientId: string;
  documents: DocumentIndexEntry[];
}

/** What `GET /api/patient/documents` answers for one record (#1171). */
export function documentIndex(
  patientId: string,
  reports: LabReportInput[],
): DocumentIndex {
  const id = encodeURIComponent(patientId);
  return {
    patientId,
    documents: [
      {
        type: "patient-summary",
        title: "Patient Summary",
        profile: EPS_PROFILES.bundle,
        href: `/api/patient/documents/patient-summary?patientId=${id}`,
      },
      ...reports.map(
        (r): DocumentIndexEntry => ({
          type: "lab-report",
          reportId: r.reportId,
          title: r.title,
          date: r.effective,
          performer: r.performer,
          results: r.results.length,
          profile: LAB_PROFILES.bundle,
          href: `/api/patient/documents/lab-report?patientId=${id}&reportId=${encodeURIComponent(
            r.reportId,
          )}`,
        }),
      ),
    ],
  };
}
