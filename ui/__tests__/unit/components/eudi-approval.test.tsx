import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// qrcode runs in the browser via canvas (unavailable in jsdom) — mock it so the
// QR <img> renders deterministically; the interactive approval is what we test.
vi.mock("qrcode", () => ({
  default: { toDataURL: () => Promise.resolve("data:image/png;base64,AAAA") },
}));
// HomeRegisterCta uses the App Router.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { EudiApprovalFlow } from "@/components/wallet/EudiApprovalFlow";
import { RegisterDialog } from "@/components/RegisterDialog";
import { HomeRegisterCta } from "@/components/HomeRegisterCta";

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("EudiApprovalFlow (interactive approval)", () => {
  it("register: trust → review → success → onComplete", () => {
    const onComplete = vi.fn();
    render(<EudiApprovalFlow mode="register" onComplete={onComplete} />);
    expect(screen.getByText(/Do you trust EHDS/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, continue" }));
    expect(screen.getByText(/Review the request/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByText(/Success/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Go to wallet" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders the QR once generated", async () => {
    render(<EudiApprovalFlow mode="login" onComplete={() => {}} />);
    await waitFor(() =>
      expect(screen.getByAltText(/QR code/i)).toBeInTheDocument(),
    );
  });

  it("Cancel fires onCancel", () => {
    const onCancel = vi.fn();
    render(
      <EudiApprovalFlow
        mode="login"
        onComplete={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("RegisterDialog", () => {
  it("renders title/subtitle and closes on Escape + the close button", () => {
    const onClose = vi.fn();
    render(
      <RegisterDialog
        title="Register with your EUDI Wallet"
        subtitle="no password"
        onClose={onClose}
        onComplete={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Register with your EUDI Wallet"),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("HomeRegisterCta", () => {
  it("opens the register dialog on click and signs in as the demo patient on completion", () => {
    render(<HomeRegisterCta />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Register with EUDI Wallet/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // drive the wallet to completion → router.push("/patient") + persona set
    fireEvent.click(screen.getByRole("button", { name: "Yes, continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to wallet" }));
    expect(push).toHaveBeenCalledWith("/patient");
    expect(sessionStorage.getItem("demo-persona")).toBe("patient1");
  });
});
