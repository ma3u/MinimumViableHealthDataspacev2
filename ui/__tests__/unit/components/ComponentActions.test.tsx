/**
 * Unit tests for ComponentActions — the Restart / Why-broken footer that
 * appears on broken EDC component cards in the topology view.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ComponentActions } from "@/components/ComponentActions";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ComponentActions", () => {
  it("renders nothing when isBroken is false", () => {
    const { container } = render(
      <ComponentActions name="mvhd-controlplane" isBroken={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Broken label, Restart button, and Why-broken toggle when broken", () => {
    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    expect(screen.getByText("Broken")).toBeInTheDocument();
    expect(screen.getByText("Restart")).toBeInTheDocument();
    expect(screen.getByText("Why broken?")).toBeInTheDocument();
  });

  it("loads the diagnosis on first toggle and renders summary + cause", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "mvhd-controlplane",
          severity: "critical",
          summary: "JVM crashes at boot",
          cause: "EDC needs four ports; ACA exposes one.",
          bootError: "java.lang.IllegalArgumentException: ...",
          remediation: "Restart will not fix this.",
          trackingIssue: "https://example.test/issue/25",
        }),
        { status: 200 },
      ),
    );

    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    fireEvent.click(screen.getByText("Why broken?"));

    await waitFor(() =>
      expect(screen.getByText("JVM crashes at boot")).toBeInTheDocument(),
    );
    expect(screen.getByText(/EDC needs four ports/i)).toBeInTheDocument();
    expect(screen.getByText(/Tracking issue/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/components/mvhd-controlplane/diagnosis",
    );
  });

  it("only fetches the diagnosis once across multiple toggles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "mvhd-controlplane",
          severity: "critical",
          summary: "x",
          cause: "y",
        }),
        { status: 200 },
      ),
    );

    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    fireEvent.click(screen.getByText("Why broken?"));
    await waitFor(() => expect(screen.getByText("x")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Why broken?")); // collapse
    fireEvent.click(screen.getByText("Why broken?")); // expand again
    await waitFor(() => expect(screen.getByText("x")).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders the failure message when diagnosis fetch returns non-OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    fireEvent.click(screen.getByText("Why broken?"));

    await waitFor(() =>
      expect(screen.getByText(/Failed to load diagnosis/i)).toBeInTheDocument(),
    );
  });

  it("posts to /restart and shows the success message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          scaledUp: true,
          message: "bumped 0→1 and restarted",
        }),
        { status: 200 },
      ),
    );

    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    fireEvent.click(screen.getByText("Restart"));

    await waitFor(() =>
      expect(screen.getByText(/bumped 0→1 and restarted/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/components/mvhd-controlplane/restart",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders the error message when restart returns non-OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Forbidden", detail: "missing ACA write" }),
        { status: 403 },
      ),
    );

    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    fireEvent.click(screen.getByText("Restart"));

    await waitFor(() =>
      expect(screen.getByText(/missing ACA write/)).toBeInTheDocument(),
    );
  });

  it("ignores duplicate Restart clicks while one is in flight", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>((r) => (resolve = r)));

    render(<ComponentActions name="mvhd-controlplane" isBroken />);
    const btn = screen.getByText("Restart");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(
      new Response(JSON.stringify({ ok: true, message: "ok" }), {
        status: 200,
      }),
    );
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
  });
});
