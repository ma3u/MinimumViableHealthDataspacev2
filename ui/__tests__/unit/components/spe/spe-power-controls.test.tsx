/**
 * Start and Stop for the SPE workspaces on the admin pages (ADR-072): the
 * power state, the buttons for the operator and the access body, the
 * progress line while a workspace starts, the command an owner runs when
 * the hub's identity lacks the role, and the polling until it runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

import { SpePowerControls } from "@/components/spe/SpePowerControls";
import { SPE_POLL_MS, useSpeStatus } from "@/components/spe/use-spe-status";
import type { SpeEntry, SpeStatusResponse } from "@/lib/spe";

const SPE: SpeEntry = {
  id: "SPE-1",
  holder: "AlphaKlinik Berlin",
  runsOn: "ACI confidential container group mvhd-spe-1 (westeurope)",
  teeType: "AMD SEV-SNP",
  attestationScope: "workload",
  simulated: false,
  label: "Attested: confidential workload",
  attestedAt: null,
  keyReleasedAt: null,
  permitId: null,
  policyHash: null,
  policyCheckedByHardware: true,
  patients: null,
  status: "unreachable",
  powerState: "stopped",
  armState: "Stopped",
  lastQueriedAt: null,
};
const ALLOWED = { available: true, reason: null };

const reply = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });

beforeEach(() => {
  mockFetchApi.mockReset();
});

describe("SpePowerControls", () => {
  it("shows a stopped workspace with Start, and starts it", async () => {
    const onChange = vi.fn();
    mockFetchApi.mockReturnValue(
      reply(202, {
        action: "start",
        spes: [{ id: "SPE-1", state: "starting", etaSeconds: 240 }],
      }),
    );
    render(<SpePowerControls spe={SPE} power={ALLOWED} onChange={onChange} />);
    expect(screen.getByText("Workspace: stopped")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop SPE-1" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Start SPE-1" }));
    expect(mockFetchApi).toHaveBeenCalledWith(
      "/api/admin/spe/power",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "start", spe: "SPE-1" }),
      }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    // The progress line, until the page reports it running.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Starting: attesting to Trustee, releasing the key, loading the data; about 3 to 4 minutes",
    );
  });

  it("shows the progress line and Stop while a workspace starts", () => {
    render(
      <SpePowerControls
        spe={{ ...SPE, powerState: "starting", armState: "Running" }}
        power={ALLOWED}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "about 3 to 4 minutes",
    );
    expect(
      screen.getByRole("button", { name: "Stop SPE-1" }),
    ).toBeInTheDocument();
  });

  it("names the command an owner runs when the hub's identity lacks the role", async () => {
    mockFetchApi.mockReturnValue(
      reply(403, {
        error:
          "The hub's identity (the system-assigned identity of mvhd-ui) may not start or stop the container group mvhd-spe-1",
        role: "Azure Container Instances Contributor Role",
        command:
          "UI_PRINCIPAL=$(az containerapp show -g rg-mvhd-dev -n mvhd-ui --query identity.principalId -o tsv); ...",
      }),
    );
    const onChange = vi.fn();
    render(<SpePowerControls spe={SPE} power={ALLOWED} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Start SPE-1" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("system-assigned identity of mvhd-ui");
    expect(alert).toHaveTextContent(
      "An owner of the resource group runs once:",
    );
    expect(alert).toHaveTextContent("identity.principalId");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows no buttons to a caller who may not, with the reason", () => {
    render(
      <SpePowerControls
        spe={{ ...SPE, powerState: "running" }}
        power={{
          available: false,
          reason: "Starting and stopping needs the Azure deployment",
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Workspace: running")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Starting and stopping needs the Azure deployment"),
    ).toBeInTheDocument();
  });

  it("says when the workspace was last queried", () => {
    render(
      <SpePowerControls
        spe={{
          ...SPE,
          powerState: "running",
          lastQueriedAt: "2026-11-02T09:00:00.000Z",
        }}
        power={ALLOWED}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Last queried 2 Nov 2026/)).toBeInTheDocument();
  });
});

describe("useSpeStatus polls while a workspace starts", () => {
  const status = (power: "starting" | "running"): SpeStatusResponse => ({
    environment: "azure",
    trustee: null,
    spes: [{ ...SPE, powerState: power }],
    residualTrust: [],
    power: ALLOWED,
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks again every 10 s until the workspace runs, then stops", async () => {
    vi.useFakeTimers();
    mockFetchApi
      .mockReturnValueOnce(reply(200, status("starting")))
      .mockReturnValueOnce(reply(200, status("starting")))
      .mockReturnValue(reply(200, status("running")));
    const { result } = renderHook(() => useSpeStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.spes[0].powerState).toBe("starting");
    expect(mockFetchApi).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPE_POLL_MS);
    });
    expect(mockFetchApi).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPE_POLL_MS);
    });
    expect(mockFetchApi).toHaveBeenCalledTimes(3);
    expect(result.current.data?.spes[0].powerState).toBe("running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPE_POLL_MS * 3);
    });
    expect(mockFetchApi).toHaveBeenCalledTimes(3);
  });

  it("does not poll a page where nothing starts, until a button calls watch()", async () => {
    vi.useFakeTimers();
    mockFetchApi.mockReturnValue(reply(200, status("running")));
    const { result } = renderHook(() => useSpeStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPE_POLL_MS * 3);
    });
    expect(mockFetchApi).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.watch();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetchApi).toHaveBeenCalledTimes(2);
    // A few polls follow even before ARM reports the change.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPE_POLL_MS);
    });
    expect(mockFetchApi).toHaveBeenCalledTimes(3);
  });
});

describe("an answer without the power field (an older route)", () => {
  it("shows the state and no buttons", async () => {
    render(<SpePowerControls spe={SPE} power={undefined} onChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("Workspace: stopped")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
