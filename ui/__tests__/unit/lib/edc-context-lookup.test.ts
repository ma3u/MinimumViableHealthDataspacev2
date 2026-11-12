/**
 * The kept list of participant contexts (#1088): one management call serves
 * the lookups of a minute, a miss asks again at once, and forgetting it
 * makes the next lookup ask.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: { management: (...a: unknown[]) => mockManagement(...a) },
}));

import {
  contextIdForDid,
  identityOfContext,
  forgetContexts,
} from "@/lib/edc/context-lookup";
import { __resetCacheForTests } from "@/lib/server-cache";

const ALPHA = { "@id": "alpha-ctx", identity: "did:web:h:alpha-klinik" };
const PHARMA = { "@id": "pharma-ctx", identity: "did:web:h:pharmaco" };

beforeEach(() => {
  mockManagement.mockReset();
  __resetCacheForTests();
});

describe("context lookup", () => {
  it("lists the contexts once for many lookups", async () => {
    mockManagement.mockResolvedValue([ALPHA, PHARMA]);

    // Read for this lookup: not kept, so a failure on it is not retried.
    expect(await contextIdForDid("did:web:h:alpha-klinik")).toEqual({
      id: "alpha-ctx",
      kept: false,
    });
    expect(await identityOfContext("pharma-ctx")).toBe("did:web:h:pharmaco");
    expect(await contextIdForDid("did:web:h:pharmaco")).toEqual({
      id: "pharma-ctx",
      kept: true,
    });
    expect(mockManagement).toHaveBeenCalledTimes(1);
    expect(mockManagement).toHaveBeenCalledWith("/v5/participants");
  });

  it("asks again at once for a DID the kept list does not name", async () => {
    mockManagement
      .mockResolvedValueOnce([ALPHA])
      .mockResolvedValueOnce([ALPHA, PHARMA]);
    await contextIdForDid("did:web:h:alpha-klinik");

    // Onboarded since the list was read.
    expect(await contextIdForDid("did:web:h:pharmaco")).toEqual({
      id: "pharma-ctx",
      kept: false,
    });
    expect(mockManagement).toHaveBeenCalledTimes(2);
  });

  it("throws, naming the DID, when no context has it", async () => {
    mockManagement.mockResolvedValue([ALPHA]);
    await expect(contextIdForDid("did:web:nobody")).rejects.toThrow(
      "No participant context has the identity did:web:nobody",
    );
  });

  it("asks again for a context id the kept list does not name", async () => {
    mockManagement.mockResolvedValueOnce([ALPHA]).mockResolvedValueOnce([]);
    expect(await identityOfContext("alpha-ctx")).toBe("did:web:h:alpha-klinik");
    expect(await identityOfContext("gone-ctx")).toBeNull();
    expect(mockManagement).toHaveBeenCalledTimes(2);
  });

  it("reads the list afresh after it is forgotten", async () => {
    mockManagement
      .mockResolvedValueOnce([ALPHA])
      .mockResolvedValueOnce([{ ...ALPHA, "@id": "alpha-ctx-new" }]);
    await contextIdForDid("did:web:h:alpha-klinik");
    forgetContexts();
    expect((await contextIdForDid("did:web:h:alpha-klinik")).id).toBe(
      "alpha-ctx-new",
    );
  });

  it("treats an answer that is not a list as no contexts", async () => {
    mockManagement.mockResolvedValue({ unexpected: true });
    expect(await identityOfContext("alpha-ctx")).toBeNull();
  });
});
