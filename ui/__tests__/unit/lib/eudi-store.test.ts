import { describe, it, expect } from "vitest";
import {
  newSid,
  newNonce,
  putTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/eudi-store";

describe("eudi-store", () => {
  it("issues unique sids and nonces", () => {
    expect(newSid()).not.toBe(newSid());
    expect(newNonce()).not.toBe(newNonce());
  });

  it("stores a transaction as pending and retrieves it by sid", () => {
    const sid = newSid();
    putTransaction({ sid, transactionId: "tx-1", nonce: "n-1" });
    const tx = getTransaction(sid);
    expect(tx?.status).toBe("pending");
    expect(tx?.transactionId).toBe("tx-1");
  });

  it("pins a verified patient and supports single-use consumption", () => {
    const sid = newSid();
    putTransaction({ sid, transactionId: "tx-2", nonce: "n-2" });
    updateTransaction(sid, {
      status: "completed",
      verifiedPatient: {
        username: "patient1",
        displayName: "Erika Mustermann",
        roles: ["PATIENT"],
      },
    });
    const tx = getTransaction(sid);
    expect(tx?.status).toBe("completed");
    expect(tx?.verifiedPatient?.username).toBe("patient1");
    updateTransaction(sid, { consumed: true });
    expect(getTransaction(sid)?.consumed).toBe(true);
  });

  it("returns undefined after deletion", () => {
    const sid = newSid();
    putTransaction({ sid, transactionId: "tx-3", nonce: "n-3" });
    deleteTransaction(sid);
    expect(getTransaction(sid)).toBeUndefined();
  });
});
