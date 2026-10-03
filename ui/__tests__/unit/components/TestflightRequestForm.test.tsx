import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TestflightRequestForm,
  buildTestflightMailto,
} from "@/components/TestflightRequestForm";

describe("buildTestflightMailto", () => {
  it("addresses Matthias with the name and Apple ID in the body", () => {
    const url = buildTestflightMailto("Ada Tester", "ada@example.org", "");
    expect(url.startsWith("mailto:matthias.buchhorn@web.de?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject")).toMatch(/Klarbefund TestFlight/);
    expect(params.get("body")).toContain("Name: Ada Tester");
    expect(params.get("body")).toContain("ada@example.org");
  });

  it("adds the note only when there is one", () => {
    const without = buildTestflightMailto("A", "a@example.org", "   ");
    const withNote = buildTestflightMailto("A", "a@example.org", "iPhone 17");
    expect(decodeURIComponent(withNote)).toContain("iPhone 17");
    expect(withNote.length).toBeGreaterThan(without.length);
  });
});

async function fillAndSend() {
  await userEvent.type(screen.getByLabelText(/your name/i), "Ada Tester");
  await userEvent.type(
    screen.getByLabelText(/apple id email/i),
    "ada@example.org",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /send the request/i }),
  );
}

describe("TestflightRequestForm (ADR-048)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts the request in the background and opens no mail app", async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"status":"queued"}', { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<TestflightRequestForm />);
    await fillAndSend();

    expect(open).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/testflight-request");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Ada Tester",
      appleId: "ada@example.org",
      note: "",
      website: "",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /request is on its way/i,
    );
    expect(screen.getByLabelText(/your name/i)).toHaveValue("");
  });

  it("offers the filled-in mail draft when the hub cannot send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"x"}', { status: 503 })),
    );
    render(<TestflightRequestForm />);
    await fillAndSend();

    const link = await screen.findByRole("link", {
      name: /write it in your mail app/i,
    });
    expect(link.getAttribute("href")).toMatch(
      /^mailto:matthias\.buchhorn@web\.de\?.*Ada%20Tester/,
    );
  });

  it("asks to wait when the hub answers 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"x"}', { status: 429 })),
    );
    render(<TestflightRequestForm />);
    await fillAndSend();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /too many requests/i,
    );
  });

  it("sends nothing while the Apple ID is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<TestflightRequestForm />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Ada");
    await userEvent.click(
      screen.getByRole("button", { name: /send the request/i }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the address out of the markup until a draft is offered", () => {
    const { container } = render(<TestflightRequestForm />);
    expect(container.innerHTML).not.toContain("web.de");
  });
});

describe("TestflightRequestForm in the static build", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("writes the mailto draft, since there is no API", async () => {
    vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");
    vi.resetModules();
    const { TestflightRequestForm: StaticForm } = await import(
      "@/components/TestflightRequestForm"
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<StaticForm />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Ada Tester");
    await userEvent.type(
      screen.getByLabelText(/apple id email/i),
      "ada@example.org",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /write the request/i }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toMatch(/^mailto:matthias\.buchhorn@web\.de/);
    expect(screen.getByRole("status")).toHaveTextContent(
      /mail app should now show the request/i,
    );
  });
});
