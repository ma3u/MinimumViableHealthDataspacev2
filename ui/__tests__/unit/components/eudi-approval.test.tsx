import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

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
  it("register: dashboard → request → consent → code → sent → onComplete", () => {
    const onComplete = vi.fn();
    render(<EudiApprovalFlow mode="register" onComplete={onComplete} />);
    expect(screen.getByText("Digital ID")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(
      screen.getByText(/This service is requesting data/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText(/These data will be transferred/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Enter Digital ID code/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transfer data" }));
    expect(screen.getByText(/Data sent successfully/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders the QR once generated", async () => {
    render(<EudiApprovalFlow mode="login" onComplete={() => {}} />);
    await waitFor(() =>
      expect(screen.getByAltText(/QR code/i)).toBeInTheDocument(),
    );
  });

  it("Reject fires onCancel", () => {
    const onCancel = vi.fn();
    render(
      <EudiApprovalFlow
        mode="login"
        onComplete={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
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
      screen.getByRole("button", { name: /Register with d-you/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // drive the wallet to completion → router.push("/patient") + persona set
    fireEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer data" }));
    // the phone's Close, not the dialog's close cross
    const phone = screen.getByRole("group", { name: /Approve d-you register/ });
    fireEvent.click(within(phone).getByRole("button", { name: "Close" }));
    expect(push).toHaveBeenCalledWith("/patient");
    expect(sessionStorage.getItem("demo-persona")).toBe("patient1");
  });
});
