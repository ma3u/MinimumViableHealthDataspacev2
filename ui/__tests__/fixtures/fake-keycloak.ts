/**
 * Keycloak's admin API, as much of it as the sandbox accounts and the PID
 * link of ADR-067 use, held in memory. Installed with vi.stubGlobal("fetch").
 */
import { vi } from "vitest";

export interface FakeUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  attributes?: Record<string, string[]>;
}

export interface FakeCall {
  url: string;
  method: string;
  body?: string;
}

export function fakeKeycloak(seed: FakeUser[] = []) {
  const users = new Map<string, FakeUser>(
    seed.map((u) => [u.id, structuredClone(u)]),
  );
  const calls: FakeCall[] = [];
  let next = 1;
  /** Set to make the next matching call answer this status instead. */
  const fail: { create?: number; put?: number; search?: number } = {};

  const fetcher = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push({
      url,
      method,
      body: init.body ? String(init.body) : undefined,
    });
    if (url.endsWith("/protocol/openid-connect/token")) {
      return Response.json({ access_token: "svc" });
    }
    const m = /\/admin\/realms\/[^/]+\/users(?:\/([^/?]+))?(?:\?(.*))?$/.exec(
      url,
    );
    if (!m) return new Response("{}", { status: 404 });
    const [, id, query] = m;
    if (!id && method === "GET") {
      if (fail.search) return new Response("[]", { status: fail.search });
      const params = new URLSearchParams(query ?? "");
      const q = params.get("q");
      const username = params.get("username");
      let found = [...users.values()];
      if (q) {
        const i = q.indexOf(":");
        const [name, value] = [q.slice(0, i), q.slice(i + 1)];
        found = found.filter((u) => u.attributes?.[name]?.includes(value));
      }
      if (username) found = found.filter((u) => u.username === username);
      return Response.json(found);
    }
    if (!id && method === "POST") {
      if (fail.create) return new Response(null, { status: fail.create });
      const body = JSON.parse(String(init.body)) as FakeUser;
      const user = { ...body, id: `u-${next++}` };
      users.set(user.id, user);
      return new Response(null, { status: 201 });
    }
    const user = id ? users.get(id) : undefined;
    if (!user) return new Response("{}", { status: 404 });
    if (method === "GET") return Response.json(user);
    if (method === "PUT") {
      if (fail.put) return new Response(null, { status: fail.put });
      const body = JSON.parse(String(init.body)) as FakeUser;
      // Keycloak drops an attribute set to no value.
      const attributes = Object.fromEntries(
        Object.entries(body.attributes ?? {}).filter(([, v]) => v.length > 0),
      );
      users.set(user.id, { ...body, id: user.id, attributes });
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      users.delete(user.id);
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 405 });
  });
  vi.stubGlobal("fetch", fetcher);

  return {
    users,
    calls,
    fail,
    fetcher,
    byUsername: (username: string) =>
      [...users.values()].find((u) => u.username === username),
  };
}
