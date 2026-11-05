/**
 * GET /api/transfers/[id]/data: the data a STARTED pull transfer gives
 * access to, through the consumer's siglet and the provider's data plane
 * (#876). Patient resources are pseudonymised for roles without identity
 * (#475).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: { management: (...a: unknown[]) => mockManagement(...a) },
}));

import { requireAuth } from "@/lib/auth-guard";
import { GET } from "@/app/api/transfers/[id]/data/route";
import { pseudonymiseFhir } from "@/lib/transfer-data";

const CTX = "3386f049-185a-4b5c-a24a-e5719df88412";
const TP = "824277d3-90cf-4b96-8ad1-ea489ba34775";

const BUNDLE = {
  resourceType: "Bundle",
  type: "searchset",
  entry: [
    {
      fullUrl: "http://fhir/Patient/P1",
      resource: {
        resourceType: "Patient",
        id: "P1",
        name: [{ family: "Musterfrau", given: ["Erika"] }],
        birthDate: "1965-04-12",
        gender: "female",
        address: [{ city: "Berlin" }],
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "O1",
        subject: { reference: "Patient/P1" },
        code: { text: "HbA1c" },
      },
    },
  ],
};

function get(id = TP, participantId = CTX) {
  return GET(
    new NextRequest(
      `http://localhost/api/transfers/${id}/data?participantId=${participantId}`,
    ),
    { params: Promise.resolve({ id }) },
  );
}

function asRoles(roles: string[]) {
  vi.mocked(requireAuth).mockResolvedValueOnce({
    session: { user: {}, roles, accessToken: "t" },
  } as never);
}

const fetchMock = vi.fn();

beforeEach(() => {
  mockManagement.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function siglet(token = "tok", endpoint?: string) {
  return new Response(JSON.stringify({ token, endpoint }), { status: 200 });
}
function dataPlane(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/fhir+json" },
  });
}

describe("GET /api/transfers/[id]/data", () => {
  it("asks siglet for the flow's token and the data plane for the data", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED", assetId: "a1" });
    fetchMock
      .mockResolvedValueOnce(siglet("tok-1"))
      .mockResolvedValueOnce(dataPlane(BUNDLE));

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `http://siglet:8080/tokens/${CTX}/${TP}`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://neo4j-proxy:9090/dataspace/data",
    );
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("tok-1");
    expect(body.assetId).toBe("a1");
    expect(body.data.entry).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain("tok-1");
  });

  it("calls the endpoint siglet names on EDC 1.0 (#881)", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(
        siglet("tok-3", "http://neo4j-proxy:9090/dataspace/data"),
      )
      .mockResolvedValueOnce(dataPlane(BUNDLE));

    const res = await get();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://neo4j-proxy:9090/dataspace/data",
    );
  });

  it("refuses an endpoint whose host is not in EDR_DATA_HOSTS, before calling it", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock.mockResolvedValueOnce(
      siglet("tok-4", "http://169.254.169.254/latest/meta-data"),
    );

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.step).toBe("token");
    expect(body.detail).toMatch(
      /169\.254\.169\.254, which is not in EDR_DATA_HOSTS/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries the correlation id when siglet does not know the transfer id", async () => {
    mockManagement.mockResolvedValue({
      state: "STARTED",
      correlationId: "corr-1",
    });
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(siglet())
      .mockResolvedValueOnce(dataPlane(BUNDLE));

    const res = await get();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `http://siglet:8080/tokens/${CTX}/corr-1`,
    );
  });

  it("retries the data plane with Bearer when the bare token is refused", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(siglet("tok-2"))
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(dataPlane(BUNDLE));

    const res = await get();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(
      "Bearer tok-2",
    );
  });

  it("says what a 404 and a 401 from the data plane mean", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(siglet())
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    const notServed = await (await get()).json();
    expect(notServed.detail).toMatch(/serves no data for this asset \(404\)/);

    fetchMock
      .mockResolvedValueOnce(siglet())
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    const expired = await (await get()).json();
    expect(expired.detail).toMatch(/refused the access token \(401\)/);
    expect(expired.detail).toMatch(/start a new transfer/);
  });

  it("answers 409 for a transfer that is not STARTED", async () => {
    mockManagement.mockResolvedValue({ state: "TERMINATED" });

    const res = await get();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("TERMINATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says which step failed when siglet has no token", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.step).toBe("token");
    expect(body.detail).toContain("404");
  });

  it("refuses an id siglet would not accept, before asking anyone", async () => {
    const res = await get("../tokens");

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("pseudonymises Patient resources for a data user (#475)", async () => {
    asRoles(["EDC_USER_PARTICIPANT", "DATA_USER"]);
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(siglet())
      .mockResolvedValueOnce(dataPlane(BUNDLE));

    const body = await (await get()).json();
    const text = JSON.stringify(body.data);

    expect(text).not.toContain("Musterfrau");
    expect(text).not.toContain("1965-04-12");
    expect(text).not.toContain("Berlin");
    const patient = body.data.entry[0].resource;
    expect(patient).toMatchObject({ gender: "female", birthDate: "1965" });
    expect(patient.id).toMatch(/^p-[0-9a-f]{8}$/);
    expect(body.data.entry[1].resource.subject.reference).toBe(
      `Patient/${patient.id}`,
    );
    expect(body.data.entry[0].fullUrl).toBe(
      `http://fhir/Patient/${patient.id}`,
    );
  });

  it("keeps identity for the data holder's own staff", async () => {
    asRoles(["DATA_HOLDER"]);
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(siglet())
      .mockResolvedValueOnce(dataPlane(BUNDLE));

    const body = await (await get()).json();

    expect(JSON.stringify(body.data)).toContain("Musterfrau");
  });
});

describe("pseudonymiseFhir", () => {
  it("leaves data without Patient resources as it is", () => {
    const obs = { resourceType: "Observation", subject: "Patient/X" };
    expect(pseudonymiseFhir(obs)).toEqual(obs);
  });
});
