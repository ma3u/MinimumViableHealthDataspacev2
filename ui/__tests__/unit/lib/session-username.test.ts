import { describe, it, expect, vi, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";
import { sessionUsername } from "@/lib/patient/session-username";

afterEach(() => {
  vi.mocked(getServerSession).mockReset();
});

describe("sessionUsername", () => {
  it("reads the login the session callback puts on session.user (EUDI sign-in, ADR-067)", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Patient 1a2b3c4d", preferredUsername: "kb-ab3dk7mn" },
      expires: "2099-01-01",
    });
    expect(await sessionUsername()).toBe("kb-ab3dk7mn");
  });

  it("falls back to the mail's local part, then the name", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "x", email: "patient1@example.invalid" },
      expires: "2099-01-01",
    });
    expect(await sessionUsername()).toBe("patient1");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "patient2" },
      expires: "2099-01-01",
    });
    expect(await sessionUsername()).toBe("patient2");
  });

  it("is null without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(await sessionUsername()).toBeNull();
  });
});
