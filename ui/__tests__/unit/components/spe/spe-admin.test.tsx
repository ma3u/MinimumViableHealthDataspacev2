/**
 * The SPEs of ADR-068 in the administration (#774): the dashboard card, the
 * topology on /admin/components, the permit bindings on /admin/policies and
 * the "Secure processing" group of the audit trail. Assertions are on what a
 * person sees and on accessible names.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import path from "path";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

import { SpeStatusCard, SpeStatusView } from "@/components/spe/SpeStatusCard";
import { SpePermitBindingsView } from "@/components/spe/SpePermitBindings";
import { SpeTopologyView } from "@/app/admin/components/_components/SpeTopologySection";
import { SpeAuditSection } from "@/app/admin/audit/_components/SpeAuditSection";
import {
  ADR_068_URL,
  type SpeAuditEvent,
  type SpeStatusResponse,
} from "@/lib/spe";

const MOCK_DIR = path.resolve(__dirname, "../../../../public/mock");
const STATIC_SPE = JSON.parse(
  readFileSync(path.join(MOCK_DIR, "admin_spe.json"), "utf8"),
) as SpeStatusResponse;
const STATIC_AUDIT = JSON.parse(
  readFileSync(path.join(MOCK_DIR, "admin_audit.json"), "utf8"),
) as { speEvents: SpeAuditEvent[] };

const AZURE: SpeStatusResponse = {
  environment: "azure",
  trustee: {
    url: "https://trustee.example",
    operator: "MedReg DE (access body)",
    verifier: "snp",
    reachable: true,
  },
  spes: [0, 1].map((i) => ({
    ...STATIC_SPE.spes[i],
    runsOn: `ACI confidential container group mvhd-spe-${i + 1} (westeurope)`,
    teeType: "AMD SEV-SNP",
    attestationScope: "workload" as const,
    simulated: false,
    label: "Attested: confidential workload",
    policyCheckedByHardware: true,
  })),
  residualTrust: [
    "AMD root of trust",
    "Microsoft utility VM image (measurement endorsed by Microsoft)",
  ],
};

/** Node-level evidence (ADR-068 A1), still a label the UI must render. */
const NODE_LEVEL: SpeStatusResponse = {
  ...AZURE,
  spes: [
    {
      ...AZURE.spes[0],
      runsOn: "a confidential VM node",
      attestationScope: "node",
      label: "Attested: SEV-SNP node",
      policyCheckedByHardware: false,
    },
    AZURE.spes[1],
  ],
};

describe("the static fixtures", () => {
  it("admin_spe.json is in the contract shape, both SPEs simulated", () => {
    expect(STATIC_SPE.environment).toBe("static");
    expect(STATIC_SPE.spes.map((s) => s.id)).toEqual(["SPE-1", "SPE-2"]);
    for (const spe of STATIC_SPE.spes) {
      expect(spe.label).toBe("Simulated attestation");
      expect(spe.simulated).toBe(true);
      expect(spe.policyCheckedByHardware).toBe(false);
      expect(spe.policyHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      // The sample attester: simulated evidence, no vTPM, no PCRs.
      expect(spe.attestation?.verifier).toBe("sample");
      expect(spe.attestation?.claims?.tee).toBe("sample");
      expect(spe.attestation?.claims?.pcrs).toBeNull();
    }
  });

  it("admin_audit.json carries all five SPE event types, all simulated", () => {
    const types = new Set(STATIC_AUDIT.speEvents.map((e) => e.eventType));
    expect([...types].sort()).toEqual([
      "spe.attestation",
      "spe.key_refused",
      "spe.key_release",
      "spe.workspace_destroyed",
      "spe.workspace_loaded",
    ]);
    expect(STATIC_AUDIT.speEvents.every((e) => e.simulated === true)).toBe(
      true,
    );
  });
});

describe("SpeStatusView (dashboard)", () => {
  it("shows each SPE with holder, where it runs and the amber simulated label", () => {
    render(<SpeStatusView data={STATIC_SPE} />);
    const spe1 = screen.getByRole("region", {
      name: "SPE-1, AlphaKlinik Berlin",
    });
    expect(
      within(spe1).getByText(/neo4j workspace \(M1, no TEE\)/),
    ).toBeInTheDocument();
    expect(within(spe1).getByText("167")).toBeInTheDocument();
    expect(within(spe1).getByText("ready")).toBeInTheDocument();
    const badge = within(spe1).getByRole("link", {
      name: "Simulated attestation, see ADR-068",
    });
    expect(badge).toHaveAttribute("href", ADR_068_URL);
    expect(
      screen.getByRole("region", { name: "SPE-2, Limburg Medical Centre" }),
    ).toBeInTheDocument();
  });

  it("links each SPE to its section on /admin/attestation", () => {
    render(<SpeStatusView data={STATIC_SPE} />);
    expect(
      screen.getByRole("link", { name: "Attestation evidence for SPE-1" }),
    ).toHaveAttribute("href", "/admin/attestation#attestation-spe-1");
    expect(
      screen.getByRole("link", { name: "Attestation evidence for SPE-2" }),
    ).toHaveAttribute("href", "/admin/attestation#attestation-spe-2");
  });

  it("shows the Trustee line and that nothing is proven locally", () => {
    render(<SpeStatusView data={STATIC_SPE} />);
    const trustee = screen.getByTestId("spe-trustee");
    expect(trustee).toHaveTextContent("MedReg DE (access body)");
    expect(trustee).toHaveTextContent("sample");
    expect(trustee).toHaveTextContent("reachable");
    expect(screen.getByTestId("spe-residual-trust")).toHaveTextContent(
      "None proven: no TEE on this machine",
    );
  });

  it("shows no residual trust line when there is none", () => {
    render(<SpeStatusView data={{ ...STATIC_SPE, residualTrust: [] }} />);
    expect(screen.queryByTestId("spe-residual-trust")).toBeNull();
  });

  it("shows the attested labels and the residual trust on Azure", () => {
    render(<SpeStatusView data={NODE_LEVEL} />);
    expect(
      screen.getByRole("link", { name: "Attested: SEV-SNP node, see ADR-068" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Attested: confidential workload, see ADR-068",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("spe-residual-trust")).toHaveTextContent(
      "AMD root of trust, Microsoft utility VM image (measurement endorsed by Microsoft)",
    );
  });

  it("says when it is a fallback and that nothing was attested", () => {
    render(
      <SpeStatusView
        data={{
          ...STATIC_SPE,
          environment: "local",
          trustee: null,
          spes: [
            {
              ...STATIC_SPE.spes[0],
              attestedAt: null,
              keyReleasedAt: null,
              patients: null,
              status: "unreachable",
            },
          ],
          fallback: { reason: "The query proxy is unreachable" },
        }}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "The query proxy is unreachable",
    );
    expect(screen.getAllByText("not yet")).toHaveLength(2);
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.getByTestId("spe-trustee")).toHaveTextContent(
      "not reported by the proxy",
    );
  });
});

describe("SpeStatusCard", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("reads /api/admin/spe and shows the environment", async () => {
    mockFetchApi.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STATIC_SPE,
    });
    render(<SpeStatusCard />);
    expect(
      screen.getByRole("heading", { name: "Secure processing environments" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Static demo")).toBeInTheDocument();
    expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/spe");
  });

  it("says so when the route refuses", async () => {
    mockFetchApi.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    });
    render(<SpeStatusCard />);
    expect(
      await screen.findByText(
        "Secure processing environments unavailable: Forbidden",
      ),
    ).toBeInTheDocument();
  });
});

describe("SpeTopologyView (/admin/components)", () => {
  it("shows both ACI confidential container groups, in use on Azure", () => {
    render(<SpeTopologyView data={AZURE} />);
    const groups = screen.getByRole("list", {
      name: "ACI confidential container groups",
    });
    for (const n of [1, 2]) {
      const group = within(groups).getByLabelText(
        `ACI container group mvhd-spe-${n}`,
      );
      expect(group).toHaveTextContent("sku Confidential");
      expect(group).toHaveTextContent("AMD SEV-SNP");
      expect(group).toHaveTextContent("westeurope");
      expect(group).toHaveTextContent("neo4j 1.5 vCPU 4 GB");
      expect(group).toHaveTextContent("spe-ingest 0.5 vCPU 1 GB");
      expect(group).toHaveTextContent("init spe-unlock");
      expect(group).toHaveTextContent("€0.13 an hour while running");
      expect(group).toHaveTextContent("ADR-053");
      expect(within(group).getByText("in use")).toBeInTheDocument();
      expect(
        within(group).getByLabelText(`SPE-${n} workspace`),
      ).toHaveTextContent(`mvhd-spe-${n} (westeurope)`);
    }
    const trustee = screen.getByLabelText("Trustee mvhd-trustee");
    expect(trustee).toHaveTextContent("snp");
    expect(trustee).toHaveTextContent("reachable");
  });

  it("does not mark a group in use on a stack that does not run there", () => {
    render(<SpeTopologyView data={STATIC_SPE} />);
    expect(screen.getAllByText("not used by this stack")).toHaveLength(2);
    expect(screen.getByLabelText("SPE-1 workspace")).toBeInTheDocument();
  });

  it("says the Trustee was not reported in the fallback", () => {
    render(<SpeTopologyView data={null} />);
    expect(screen.getByText("SPE-1 not reported")).toBeInTheDocument();
    expect(screen.getByText("SPE-2 not reported")).toBeInTheDocument();
    expect(screen.getByLabelText("Trustee mvhd-trustee")).toHaveTextContent(
      "Not reported by the proxy",
    );
  });
});

describe("SpePermitBindingsView (/admin/policies)", () => {
  it("shows each permit's policy hash, Trustee resource and that it is recorded only", () => {
    render(<SpePermitBindingsView data={STATIC_SPE} />);
    const row = screen.getByRole("row", { name: "Permit binding for SPE-1" });
    expect(row).toHaveTextContent("hdab-medreg-pharmaco-2026-001");
    expect(row).toHaveTextContent("default/spe-1/extract-key");
    const hash = within(row).getByTestId("policy-hash");
    expect(hash).toHaveTextContent("sha256:4f1c9a27d83e…");
    expect(hash).toHaveAttribute("title", STATIC_SPE.spes[0].policyHash);
    expect(
      within(row).getByLabelText("Policy check: Recorded only (M1)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Permit binding for SPE-2" }),
    ).toHaveTextContent("default/spe-2/extract-key");
  });

  it("marks the hash checked by hardware only for workload evidence (A2)", () => {
    render(<SpePermitBindingsView data={NODE_LEVEL} />);
    expect(
      within(
        screen.getByRole("row", { name: "Permit binding for SPE-1" }),
      ).getByLabelText("Policy check: Recorded only (A1)"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("row", { name: "Permit binding for SPE-2" }),
      ).getByLabelText(
        "Policy check: Checked by hardware (A2, workload evidence)",
      ),
    ).toBeInTheDocument();
  });

  it("copies the full hash", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<SpePermitBindingsView data={STATIC_SPE} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: `Copy policy hash ${STATIC_SPE.spes[0].policyHash}`,
      }),
    );
    expect(writeText).toHaveBeenCalledWith(STATIC_SPE.spes[0].policyHash);
  });
});

describe("SpeAuditSection (/admin/audit)", () => {
  it("lists the events with readable labels and the evidence summary", () => {
    render(<SpeAuditSection events={STATIC_AUDIT.speEvents} />);
    expect(screen.getByText("(9 of 9)")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Key released")).toHaveLength(2);
    expect(within(table).getByText("Key refused")).toBeInTheDocument();
    expect(within(table).getByText("Workspace destroyed")).toBeInTheDocument();
    expect(within(table).getAllByText("Simulated")).toHaveLength(9);
    expect(within(table).getAllByTestId("policy-hash")[0]).toHaveAttribute(
      "title",
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    );
  });

  it("filters by event type in the Secure processing group", async () => {
    render(<SpeAuditSection events={STATIC_AUDIT.speEvents} />);
    const group = screen.getByRole("group", {
      name: "Secure processing event types",
    });
    await userEvent.click(within(group).getByLabelText("Key released"));
    expect(screen.getByText("(7 of 9)")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByText("Key released"),
    ).toBeNull();
  });

  it("filters by SPE", async () => {
    render(<SpeAuditSection events={STATIC_AUDIT.speEvents} />);
    await userEvent.selectOptions(screen.getByLabelText("SPE"), "SPE-1");
    expect(screen.getByText("(4 of 9)")).toBeInTheDocument();
  });

  it("says when there is nothing recorded", () => {
    render(<SpeAuditSection events={[]} />);
    expect(
      screen.getByText("No secure processing events recorded"),
    ).toBeInTheDocument();
  });
});

describe("the audit page tab", () => {
  it("offers Secure processing and asks the route for type=spe", async () => {
    mockFetchApi.mockReset();
    mockFetchApi.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.includes("type=participants")
            ? { participants: [] }
            : url.includes("type=spe")
              ? { type: "spe", limit: 50, speEvents: STATIC_AUDIT.speEvents }
              : { type: "all", limit: 50 },
      }),
    );
    const { default: AdminAuditPage } = await import("@/app/admin/audit/page");
    render(<AdminAuditPage />);
    await userEvent.click(
      screen.getByRole("button", { name: "Secure processing" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("spe-audit-section")).toBeInTheDocument(),
    );
    expect(
      mockFetchApi.mock.calls.some(([u]) => String(u).includes("type=spe")),
    ).toBe(true);
  });
});
