"use client";

/**
 * The federation's register of members on /catalog (ADR-100 decision 5,
 * draft SPE implementing act Art. 18(1), #1236). /catalog needs a session;
 * the same register is public as JSON-LD in the static documentation site.
 */
import { Network, Download, FileText } from "lucide-react";
import {
  FEDERATION_MEMBERS,
  FEDERATION_AGREEMENT_URL,
  FEDERATION_REGISTER_PATH,
  ACCESS_BODY,
  COORDINATOR,
  type MembershipStatus,
} from "@/lib/federation-members";
import { BASE_PATH } from "@/lib/static-export";
import { useT } from "@/lib/i18n/translate";

const STATUS_TEXT: Record<MembershipStatus, string> = {
  admitted: "Admitted",
  suspended: "Suspended",
  excluded: "Excluded",
};

const STATUS_CLASS: Record<MembershipStatus, string> = {
  admitted: "bg-(--success)/10 text-(--success-text) border-(--success)/30",
  suspended: "bg-(--warning)/10 text-(--warning-text) border-(--warning)/30",
  excluded: "bg-(--danger)/10 text-(--danger-text) border-(--danger)/30",
};

export default function FederationMembers() {
  const t = useT("catalog");
  return (
    <section
      aria-labelledby="federation-members-title"
      data-testid="federation-members"
      className="mb-8 bg-(--surface) rounded-xl p-6"
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
        <div className="space-y-1">
          <h2
            id="federation-members-title"
            className="flex items-center gap-2 text-lg font-bold text-(--text-primary)"
          >
            <Network size={18} aria-hidden="true" />
            {t("Federation members")}
          </h2>
          <p className="text-sm text-(--text-secondary) max-w-3xl">
            {t(
              "The secure processing environments that answer federated queries, published as HealthDCAT-AP data services. {coordinator} coordinates them; {accessBody} admits and excludes them under the federation agreement.",
              { coordinator: COORDINATOR.name, accessBody: ACCESS_BODY.name },
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-bold sm:shrink-0">
          <a
            href={`${BASE_PATH}${FEDERATION_REGISTER_PATH}`}
            download
            className="inline-flex items-center gap-1 text-(--accent) hover:underline"
          >
            <Download size={14} aria-hidden="true" />
            {t("Register (JSON-LD)")}
          </a>
          <a
            href={FEDERATION_AGREEMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-(--accent) hover:underline"
          >
            <FileText size={14} aria-hidden="true" />
            {t("Federation agreement")}
          </a>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {FEDERATION_MEMBERS.map((m) => (
          <li
            key={m.serviceId}
            data-testid={`federation-member-${m.speId}`}
            className="rounded-lg border border-(--border-ui) bg-(--surface-card) p-4 min-w-0"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-(--text-primary)">
                {m.speId} · {m.publisher.name}
              </p>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                  STATUS_CLASS[m.status]
                }`}
              >
                {t(STATUS_TEXT[m.status])}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-(--text-secondary)">
              <dt>{t("Admitted on")}</dt>
              <dd>{m.admitted}</dd>
              <dt>{t("Agreement")}</dt>
              <dd>{m.agreementVersion}</dd>
              <dt>{t("Required attestation")}</dt>
              <dd>{m.attestationRequired}</dd>
              <dt>{t("Dataset")}</dt>
              <dd className="font-mono break-all">{m.servesDataset}</dd>
              <dt>{t("Publisher")}</dt>
              <dd className="font-mono break-all">{m.publisher.id}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
