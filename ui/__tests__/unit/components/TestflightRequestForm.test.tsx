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

describe("TestflightRequestForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the mail draft and says what happens next", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<TestflightRequestForm />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Ada Tester");
    await userEvent.type(
      screen.getByLabelText(/apple id email/i),
      "ada@example.org",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /write the request/i }),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toMatch(/^mailto:matthias\.buchhorn@web\.de/);
    expect(open.mock.calls[0][1]).toBe("_self");
    expect(screen.getByRole("status")).toHaveTextContent(
      /mail app should now show the request/i,
    );
  });

  it("does not open anything while the Apple ID is missing", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<TestflightRequestForm />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Ada");
    await userEvent.click(
      screen.getByRole("button", { name: /write the request/i }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps the address out of the markup until a request is written", () => {
    const { container } = render(<TestflightRequestForm />);
    expect(container.innerHTML).not.toContain("web.de");
  });
});
