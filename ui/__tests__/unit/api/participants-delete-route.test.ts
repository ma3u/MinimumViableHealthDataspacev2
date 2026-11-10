/**
 * DELETE /api/participants/[id] (ADR-085 step 3): EDC_ADMIN only, 409 for a
 * seeded participant, 404 for an unknown one, every step in the answer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/edc/remove-participant", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/edc/remove-participant")>();
  return { ...real, removeParticipant: vi.fn() };
});

import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  removeParticipant,
  ParticipantNotFound,
  RemovalRefused,
} from "@/lib/edc/remove-participant";
import { DELETE } from "@/app/api/participants/[id]/route";

const remove = vi.mocked(removeParticipant);
const call = (id: string) =>
  DELETE(
    new NextRequest(`http://localhost/api/participants/${id}`, {
      method: "DELETE",
    }),
    {
      params: Promise.resolve({ id }),
    },
  );

describe("DELETE /api/participants/[id]", () => {
  beforeEach(() => {
    remove.mockReset();
  });

  it("asks for EDC_ADMIN", async () => {
    remove.mockResolvedValue({ contextId: "c1", did: "did:web:x", steps: [] });
    await call("c1");
    expect(requireAuth).toHaveBeenLastCalledWith(["EDC_ADMIN"]);
  });

  it("answers the guard's 403 and removes nothing", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    vi.mocked(isAuthError).mockReturnValueOnce(true);

    const res = await call("c1");

    expect(res.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns the steps and whether all of them went through", async () => {
    remove.mockResolvedValue({
      contextId: "c1",
      did: "did:web:identityhub%3A7083:test",
      steps: [
        { step: "issuer holder", ok: true },
        { step: "control plane context", ok: true },
      ],
    });

    const res = await call("c1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ removed: "c1", complete: true });
    expect(body.steps).toHaveLength(2);
  });

  it("says complete: false when a step failed", async () => {
    remove.mockResolvedValue({
      contextId: "c1",
      did: "did:web:x",
      steps: [{ step: "issuer holder keyed by DID", ok: false, detail: "x" }],
    });

    const body = await (await call("c1")).json();

    expect(body.complete).toBe(false);
  });

  it("answers 409 for a seeded participant", async () => {
    remove.mockRejectedValue(
      new RemovalRefused("the seeded participants stay"),
    );

    const res = await call("alpha");

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("seeded");
  });

  it("answers 404 for an unknown context", async () => {
    remove.mockRejectedValue(new ParticipantNotFound("nope"));

    const res = await call("nope");

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  it("answers 502 when the control plane does not answer", async () => {
    remove.mockRejectedValue(new Error("fetch failed\nstack"));

    const res = await call("c1");
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({
      error: "Failed to remove participant",
      detail: "fetch failed",
    });
  });
});
