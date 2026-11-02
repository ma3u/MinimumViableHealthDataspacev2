/**
 * The ACI workspaces' Neo4j passwords reach the proxy through a Key Vault
 * reference that keeps a trailing newline the workspace never got (#774).
 */
import { describe, expect, it } from "vitest";
import { workspacePassword } from "../src/config";

describe("workspacePassword", () => {
  it("drops a trailing line break", () => {
    expect(workspacePassword("abc123\n", "fallback")).toBe("abc123");
    expect(workspacePassword("abc123\r\n", "fallback")).toBe("abc123");
  });

  it("keeps a password without one as it is", () => {
    expect(workspacePassword("abc 123", "fallback")).toBe("abc 123");
  });

  it("falls back when the variable is unset", () => {
    expect(workspacePassword(undefined, "fallback")).toBe("fallback");
  });
});
