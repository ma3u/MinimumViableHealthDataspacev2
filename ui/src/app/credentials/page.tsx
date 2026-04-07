"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import PageIntro from "@/components/PageIntro";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  FileKey2,
  Send,
  Trash2,
} from "lucide-react";

interface VC {
  id: string;
  type: string;
  issuer: string;
  subject: string;
  issuanceDate: string;
  expirationDate?: string;
  status: string;
  claims: Record<string, string>;
}

interface ParticipantCtx {
  "@id": string;
  identity: string;
  state: string;
}

interface CredentialDef {
  id: string;
  credentialType: string;
  format: string;
  attestations: string[];
  validity: number;
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<VC[]>([]);
  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [credentialDefs, setCredentialDefs] = useState<CredentialDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestResult, setRequestResult] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Request form
  const [reqParticipant, setReqParticipant] = useState("");
  const [reqType, setReqType] = useState("");

  useEffect(() => {
    Promise.all([
      fetchApi("/api/credentials").then((r) =>
        r.ok ? r.json() : { credentials: [] },
      ),
      fetchApi("/api/participants").then((r) => (r.ok ? r.json() : [])),
      fetchApi("/api/credentials/definitions").then((r) =>
        r.ok ? r.json() : { definitions: [] },
      ),
    ])
      .then(([creds, ctx, defs]) => {
        // API returns { credentials: [...] } with Neo4j field names — map to UI shape
        const raw: any[] = Array.isArray(creds)
          ? creds
          : creds.credentials || [];
        setCredentials(
          raw.map((c: any) => ({
            id: c.credentialId ?? c.id ?? "",
            type: c.credentialType ?? c.type ?? "",
            issuer: c.issuerDid ?? c.issuer ?? "",
            subject: c.subjectDid ?? c.subject ?? "",
            issuanceDate: c.issuedAt ?? c.issuanceDate ?? "",
            expirationDate: c.expiresAt ?? c.expirationDate,
            status: (c.status ?? "unknown").replace(/^\w/, (ch: string) =>
              ch.toUpperCase(),
            ),
            claims: {
              ...(c.holderName ? { holder: c.holderName } : {}),
              ...(c.holderType ? { type: c.holderType } : {}),
              ...(c.participantRole ? { role: c.participantRole } : {}),
              ...(c.membership ? { membership: c.membership } : {}),
              ...(c.membershipType ? { membershipType: c.membershipType } : {}),
              ...(c.jurisdiction ? { jurisdiction: c.jurisdiction } : {}),
              ...(c.ehdsArticle ? { ehdsArticle: c.ehdsArticle } : {}),
              ...(c.purpose ? { purpose: c.purpose } : {}),
              ...(c.datasetId ? { dataset: c.datasetId } : {}),
              ...(c.completeness != null
                ? { completeness: String(c.completeness) }
                : {}),
              ...(c.conformance != null
                ? { conformance: String(c.conformance) }
                : {}),
              ...(c.timeliness != null
                ? { timeliness: String(c.timeliness) }
                : {}),
            },
          })),
        );
        // API returns flat array [...] — handle both array and { participants: [...] }
        const list: ParticipantCtx[] = Array.isArray(ctx)
          ? ctx
          : ctx.participants || [];
        setParticipants(list);
        if (list.length > 0) setReqParticipant(list[0]["@id"]);
        // Load credential definitions from IssuerService
        const defList: CredentialDef[] = Array.isArray(defs)
          ? defs
          : defs.definitions || [];
        setCredentialDefs(defList);
        if (defList.length > 0) setReqType(defList[0].credentialType);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRequest = async () => {
    if (!reqParticipant) return;
    setRequesting(true);
    setRequestResult(null);

    try {
      const res = await fetchApi("/api/credentials/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantContextId: reqParticipant,
          credentialType: reqType,
        }),
      });

      if (res.ok) {
        setRequestResult("Credential request submitted successfully");
        // Refresh credentials list
        const updated = await fetchApi("/api/credentials");
        const data = await updated.json();
        const raw: any[] = Array.isArray(data) ? data : data.credentials || [];
        setCredentials(
          raw.map((c: any) => ({
            id: c.credentialId ?? c.id ?? "",
            type: c.credentialType ?? c.type ?? "",
            issuer: c.issuerDid ?? c.issuer ?? "",
            subject: c.subjectDid ?? c.subject ?? "",
            issuanceDate: c.issuedAt ?? c.issuanceDate ?? "",
            expirationDate: c.expiresAt ?? c.expirationDate,
            status: (c.status ?? "unknown").replace(/^\w/, (ch: string) =>
              ch.toUpperCase(),
            ),
            claims: {
              ...(c.holderName ? { holder: c.holderName } : {}),
              ...(c.holderType ? { type: c.holderType } : {}),
              ...(c.participantRole ? { role: c.participantRole } : {}),
              ...(c.membership ? { membership: c.membership } : {}),
              ...(c.membershipType ? { membershipType: c.membershipType } : {}),
              ...(c.jurisdiction ? { jurisdiction: c.jurisdiction } : {}),
              ...(c.ehdsArticle ? { ehdsArticle: c.ehdsArticle } : {}),
              ...(c.purpose ? { purpose: c.purpose } : {}),
              ...(c.datasetId ? { dataset: c.datasetId } : {}),
              ...(c.completeness != null
                ? { completeness: String(c.completeness) }
                : {}),
              ...(c.conformance != null
                ? { conformance: String(c.conformance) }
                : {}),
              ...(c.timeliness != null
                ? { timeliness: String(c.timeliness) }
                : {}),
            },
          })),
        );
      } else {
        const err = await res.json();
        setRequestResult(`Error: ${err.error || "Request failed"}`);
      }
    } catch {
      setRequestResult("Error: Failed to submit request");
    } finally {
      setRequesting(false);
    }
  };

  const handleRemove = async (credentialId: string) => {
    if (!confirm("Remove this credential? This cannot be undone.")) return;
    setRemovingId(credentialId);
    try {
      const res = await fetchApi(
        `/api/credentials/${encodeURIComponent(credentialId)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== credentialId));
        if (expanded === credentialId) setExpanded(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to remove credential");
      }
    } catch {
      alert("Failed to remove credential");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title="Verifiable Credentials"
          icon={FileKey2}
          description="Request and manage EHDS participant credentials issued via the IssuerService and stored in the IdentityHub. Verifiable Credentials prove identity, compliance status, and data-access authorisation within the dataspace."
          prevStep={{ href: "/compliance/tck", label: "Protocol TCK" }}
          nextStep={{ href: "/data/share", label: "Share Data" }}
          infoText="VCs follow the W3C Verifiable Credentials standard. They are cryptographically signed by the IssuerService and can be verified by any participant using the holder's DID:web identity."
          docLink={{ href: "/docs/architecture", label: "Architecture Docs" }}
        />

        {/* Request new credential */}
        <div className="border border-[var(--border)] rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Send size={18} className="text-layer2" />
            <h2 className="font-semibold text-sm">Request Credential</h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Request a Verifiable Credential (VC) from the IssuerService for a
            participant. VCs prove identity, compliance, and data-access
            authorization in the EHDS dataspace. They are stored in the
            participant&apos;s IdentityHub and presented during
            connector-to-connector negotiations.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                Participant Context
              </label>
              <select
                value={reqParticipant}
                onChange={(e) => setReqParticipant(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm"
              >
                {participants.map((p) => (
                  <option key={p["@id"]} value={p["@id"]}>
                    {p.identity?.replace("did:web:", "").replace(/%3A/g, ":") ||
                      p["@id"].slice(0, 16)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                Credential Type
              </label>
              <select
                value={reqType}
                onChange={(e) => setReqType(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm"
              >
                {credentialDefs.length > 0 ? (
                  credentialDefs.map((d) => (
                    <option key={d.id} value={d.credentialType}>
                      {d.credentialType.replace(/([A-Z])/g, " $1").trim()}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="EHDSParticipantCredential">
                      EHDS Participant Credential
                    </option>
                    <option value="DataProcessingPurposeCredential">
                      Data Processing Purpose Credential
                    </option>
                    <option value="DataQualityLabelCredential">
                      Data Quality Label Credential
                    </option>
                  </>
                )}
              </select>
            </div>

            <button
              onClick={handleRequest}
              disabled={requesting || !reqParticipant}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-layer2 text-white rounded text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
            >
              {requesting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileKey2 size={14} />
              )}
              Request
            </button>
          </div>

          {requestResult && (
            <p
              className={`mt-3 text-xs ${
                requestResult.startsWith("Error")
                  ? "text-red-400"
                  : "text-green-400"
              }`}
            >
              {requestResult}
            </p>
          )}
        </div>

        {/* Credential list */}
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading credentials…
          </div>
        ) : credentials.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheck size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">
              No credentials found in Neo4j
            </p>
            <p className="text-gray-600 text-xs mt-1">
              Register a participant and request credentials above
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {credentials.map((vc) => {
              const isOpen = expanded === vc.id;
              return (
                <div
                  key={vc.id}
                  className={`border rounded-xl transition-colors ${
                    isOpen
                      ? "border-layer2 bg-[var(--surface)]/60"
                      : "border-[var(--border)] hover:border-layer2"
                  }`}
                >
                  <button
                    className="w-full text-left p-4"
                    onClick={() => setExpanded(isOpen ? null : vc.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ShieldCheck
                          size={18}
                          className={
                            vc.status === "Active"
                              ? "text-green-400"
                              : "text-[var(--text-secondary)]"
                          }
                        />
                        <div>
                          <p className="font-medium text-sm text-gray-200">
                            {vc.type}
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {vc.subject?.slice(0, 40)}… · Issued:{" "}
                            {vc.issuanceDate?.split("T")[0]}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            vc.status === "Active"
                              ? "bg-green-900/40 text-green-400"
                              : "bg-gray-700 text-[var(--text-secondary)]"
                          }`}
                        >
                          {vc.status}
                        </span>
                        {isOpen ? (
                          <ChevronUp
                            size={16}
                            className="text-[var(--text-secondary)]"
                          />
                        ) : (
                          <ChevronDown
                            size={16}
                            className="text-[var(--text-secondary)]"
                          />
                        )}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-1.5 border-t border-[var(--border)] pt-3">
                      <div className="flex gap-3 text-xs">
                        <span className="text-[var(--text-secondary)] w-28">
                          ID
                        </span>
                        <span className="text-[var(--text-primary)] font-mono break-all">
                          {vc.id}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-[var(--text-secondary)] w-28">
                          Issuer
                        </span>
                        <span className="text-[var(--text-primary)] font-mono break-all">
                          {vc.issuer}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-[var(--text-secondary)] w-28">
                          Subject
                        </span>
                        <span className="text-[var(--text-primary)] font-mono break-all">
                          {vc.subject}
                        </span>
                      </div>
                      {vc.expirationDate && (
                        <div className="flex gap-3 text-xs">
                          <span className="text-[var(--text-secondary)] w-28">
                            Expires
                          </span>
                          <span className="text-[var(--text-primary)]">
                            {vc.expirationDate}
                          </span>
                        </div>
                      )}
                      {vc.claims &&
                        Object.entries(vc.claims).map(([k, v]) => (
                          <div key={k} className="flex gap-3 text-xs">
                            <span className="text-[var(--text-secondary)] w-28">
                              {k}
                            </span>
                            <span className="text-[var(--text-primary)]">
                              {String(v)}
                            </span>
                          </div>
                        ))}
                      <div className="pt-3 mt-2 border-t border-[var(--border)] flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(vc.id);
                          }}
                          disabled={removingId === vc.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-800 rounded hover:bg-red-900/30 disabled:opacity-50 transition-colors"
                        >
                          {removingId === vc.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
