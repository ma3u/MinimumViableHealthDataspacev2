/**
 * /admin/attestation (#774): the attestation evidence behind each SPE's label.
 * Asserts what a person sees and the accessible names, against the static
 * fixtures and an Azure-shaped answer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import path from "path";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import AdminAttestationPage from "@/app/admin/attestation/page";
import {
  ADR_068_URL,
  type SpeAuditEvent,
  type SpeStatusResponse,
} from "@/lib/spe";

const MOCK_DIR = path.resolve(__dirname, "../../../public/mock");
const STATIC_SPE = JSON.parse(
  readFileSync(path.join(MOCK_DIR, "admin_spe.json"), "utf8"),
) as SpeStatusResponse;
const STATIC_EVENTS = (
  JSON.parse(readFileSync(path.join(MOCK_DIR, "admin_audit.json"), "utf8")) as {
    speEvents: SpeAuditEvent[];
  }
).speEvents;

const PCRS = {
  pcr00: "a".repeat(64),
  pcr04: "b".repeat(64),
  pcr07: "c".repeat(64),
};

const AZURE: SpeStatusResponse = {
  environment: "azure",
  trustee: {
    url: "https://trustee.example",
    operator: "MedReg DE (access body)",
    verifier: "snp",
    reachable: true,
  },
  spes: [
    {
      ...STATIC_SPE.spes[0],
      runsOn: "ACI confidential container group mvhd-spe-1 (westeurope)",
      teeType: "AMD SEV-SNP",
      attestationScope: "workload",
      simulated: false,
      label: "Attested: confidential workload",
      policyCheckedByHardware: true,
      attestation: {
        verifier: "snp",
        result: "pass",
        evidenceDigest: "sha256:" + "d".repeat(64),
        tokenIssuedAt: "2026-10-30T07:00:00Z",
        tokenExpiresAt: "2026-10-30T07:05:00Z",
        policyId: "spe-node",
        claims: {
          tee: "snp",
          measurement: "e".repeat(96),
          reportedTcb: "bootloader 4, tee 0, snp 22, microcode 213",
          hostData: null,
          reportData: "f".repeat(128),
          pcrs: PCRS,
          vmId: "vm-sample-0001",
        },
        refusalReason: null,
      },
    },
    {
      ...STATIC_SPE.spes[1],
      runsOn: "ACI confidential container group mvhd-spe-2 (westeurope)",
      teeType: "AMD SEV-SNP",
      attestationScope: "workload",
      simulated: false,
      label: "Attested: confidential workload",
      policyCheckedByHardware: false,
      keyReleasedAt: null,
      status: "refused",
      attestation: {
        verifier: "snp",
        result: "pass",
        evidenceDigest: "sha256:" + "1".repeat(64),
        tokenIssuedAt: null,
        tokenExpiresAt: null,
        policyId: "spe-node",
        claims: null,
        refusalReason:
          "the permit's policy hash is not in the reference values",
      },
    },
  ],
  residualTrust: [
    "AMD root of trust",
    "Microsoft utility VM image (measurement endorsed by Microsoft)",
  ],
};

function answer(spe: unknown, events: SpeAuditEvent[] = STATIC_EVENTS) {
  mockFetchApi.mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        url === "/api/admin/spe"
          ? spe
          : { type: "spe", limit: 50, speEvents: events },
    }),
  );
}

describe("/admin/attestation", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("explains attestation, the A1 depth and the simulated label", async () => {
    answer(STATIC_SPE);
    render(<AdminAttestationPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "SPE attestation" }),
    ).toBeInTheDocument();
    const box = screen.getByRole("complementary", {
      name: "What attestation is",
    });
    expect(box).toHaveTextContent("but not which container runs on it");
    expect(box).toHaveTextContent("On Azure: per workload (A2)");
    expect(box).toHaveTextContent("ACI confidential container groups");
    expect(box).toHaveTextContent("inside Microsoft's utility VM");
    expect(box).toHaveTextContent("Microsoft endorses its measurement");
    expect(box).toHaveTextContent("operated as if by MedReg DE");
    expect(box).toHaveTextContent("sample attester");
    expect(box).toHaveTextContent("ADR-069");
    expect(within(box).getByRole("link", { name: /ADR-068/ })).toHaveAttribute(
      "href",
      ADR_068_URL,
    );
    expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/spe");
    expect(mockFetchApi).toHaveBeenCalledWith(
      "/api/admin/audit?type=spe&limit=50",
    );
  });

  it("shows the sample evidence of the static demo as simulated", async () => {
    answer(STATIC_SPE);
    render(<AdminAttestationPage />);
    const spe1 = await screen.findByRole("region", {
      name: "SPE-1 · AlphaKlinik Berlin",
    });
    expect(spe1).toHaveAttribute("id", "attestation-spe-1");
    expect(
      within(spe1).getByLabelText("Verdict: Verified, key released"),
    ).toBeInTheDocument();
    expect(within(spe1).getByText("Simulated")).toBeInTheDocument();
    expect(
      within(spe1).getByRole("link", {
        name: "Simulated attestation, see ADR-068",
      }),
    ).toBeInTheDocument();
    expect(spe1).toHaveTextContent("MedReg DE (access body)");
    expect(spe1).toHaveTextContent(
      STATIC_SPE.spes[0].attestation!.claims!.measurement!,
    );
    expect(spe1).toHaveTextContent("sample svn 1");
    expect(spe1).toHaveTextContent(
      "No PCRs reported (the sample attester has no vTPM)",
    );
    expect(spe1).toHaveTextContent(
      "None proven: no TEE on this machine, the evidence comes from Trustee's sample attester",
    );
  });

  it("shows the chain from permit to loaded workspace", async () => {
    answer(STATIC_SPE);
    render(<AdminAttestationPage />);
    const chain = await screen.findByRole("list", { name: "SPE-1 chain" });
    const steps = within(chain).getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent("hdab-medreg-pharmaco-2026-001");
    expect(within(steps[1]).getByTestId("policy-hash")).toHaveAttribute(
      "title",
      STATIC_SPE.spes[0].policyHash,
    );
    expect(steps[2]).toHaveTextContent("default/spe-1/extract-key");
    expect(steps[3]).toHaveTextContent("Key released");
    expect(steps[4]).toHaveTextContent("Workspace loaded");
    expect(steps[4]).not.toHaveTextContent("not yet");
  });

  it("lists the SPE's last audit events and links to the audit trail", async () => {
    answer(STATIC_SPE);
    render(<AdminAttestationPage />);
    const list = await screen.findByRole("list", {
      name: "SPE-2 audit events",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Workspace loaded");
    expect(within(list).getByText("Key refused")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", {
        name: "All events in Audit & Provenance, tab Secure processing",
      })[0],
    ).toHaveAttribute("href", "/admin/audit");
  });

  it("shows hardware evidence on Azure, PCRs in a collapsible table", async () => {
    answer(AZURE);
    render(<AdminAttestationPage />);
    const spe1 = await screen.findByRole("region", {
      name: "SPE-1 · AlphaKlinik Berlin",
    });
    expect(within(spe1).getByText("Hardware")).toBeInTheDocument();
    expect(spe1).toHaveTextContent(
      "AMD root of trust, Microsoft utility VM image (measurement endorsed by Microsoft)",
    );
    expect(spe1).toHaveTextContent("whose HOST_DATA is the hash of its policy");
    expect(
      within(spe1).getByRole("link", {
        name: "Attested: confidential workload, see ADR-068",
      }),
    ).toBeInTheDocument();
    expect(spe1).toHaveTextContent("bootloader 4, tee 0, snp 22");
    expect(spe1).toHaveTextContent("vm-sample-0001");
    const summary = within(spe1).getByText("PCRs (3)");
    const details = summary.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    await userEvent.click(summary);
    expect(details).toHaveAttribute("open");
    const table = within(spe1).getByRole("table", { name: "SPE-1 PCRs" });
    expect(within(table).getByText("pcr07")).toBeInTheDocument();
    expect(within(table).getByText(PCRS.pcr04)).toBeInTheDocument();
  });

  it("shows a refusal with its reason", async () => {
    answer(AZURE);
    render(<AdminAttestationPage />);
    const spe2 = await screen.findByRole("region", {
      name: "SPE-2 · Limburg Medical Centre",
    });
    expect(
      within(spe2).getByLabelText("Verdict: Verified, key refused"),
    ).toBeInTheDocument();
    expect(within(spe2).getByRole("alert")).toHaveTextContent(
      "the permit's policy hash is not in the reference values",
    );
  });

  it("says when evidence did not verify", async () => {
    answer({
      ...AZURE,
      spes: [
        {
          ...AZURE.spes[0],
          attestation: { ...AZURE.spes[0].attestation!, result: "fail" },
        },
      ],
    });
    render(<AdminAttestationPage />);
    expect(
      await screen.findByLabelText("Verdict: Evidence did not verify"),
    ).toBeInTheDocument();
  });

  it("shows No attestation recorded in the fallback", async () => {
    answer(
      {
        environment: "local",
        trustee: null,
        spes: [
          {
            ...STATIC_SPE.spes[0],
            runsOn: "Hub graph Neo4j, an ordinary container",
            attestedAt: null,
            keyReleasedAt: null,
            permitId: null,
            policyHash: null,
            patients: null,
            status: "unreachable",
            attestation: null,
          },
        ],
        residualTrust: [],
        fallback: { reason: "The query proxy has no /spe/status yet" },
      },
      [],
    );
    render(<AdminAttestationPage />);
    const spe1 = await screen.findByRole("region", {
      name: "SPE-1 · AlphaKlinik Berlin",
    });
    expect(screen.getByRole("note")).toHaveTextContent(
      "The query proxy has no /spe/status yet",
    );
    expect(
      within(spe1).getByLabelText("Verdict: No attestation recorded"),
    ).toBeInTheDocument();
    expect(within(spe1).getAllByText("No attestation recorded")).toHaveLength(
      2,
    );
    expect(spe1).toHaveTextContent("no permit loaded");
    expect(spe1).toHaveTextContent(
      "No secure processing events recorded for SPE-1",
    );
  });

  it("says so when the route refuses", async () => {
    mockFetchApi.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    });
    render(<AdminAttestationPage />);
    expect(
      await screen.findByText(
        "Secure processing environments unavailable: Forbidden",
      ),
    ).toBeInTheDocument();
  });
});
