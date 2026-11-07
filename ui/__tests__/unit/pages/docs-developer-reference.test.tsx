/**
 * The API reference hands Scalar its configuration. Scalar's "Open API
 * Client" button opens client.scalar.com, which cannot send this hub's
 * session cookie and which some networks do not reach (connection reset on
 * the TLS handshake), so the page hides it and the in-page client sends
 * requests instead.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const scalar = vi.hoisted(() => ({
  configuration: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@scalar/api-reference-react/style.css", () => ({}));
vi.mock("@/components/docs/DocsLastUpdated", () => ({
  DocsLastUpdated: () => null,
}));
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: { configuration: Record<string, unknown> }) => {
      scalar.configuration = props.configuration;
      return <div data-testid="scalar" />;
    };
    return Stub;
  },
}));

import ApiReferencePage from "@/app/docs/developer/reference/page";

describe("the API reference's Scalar configuration", () => {
  it("hides the button that opens client.scalar.com", () => {
    render(<ApiReferencePage />);
    expect(scalar.configuration?.hideClientButton).toBe(true);
  });

  it("links each specification the API implements", () => {
    const { getByTestId } = render(<ApiReferencePage />);
    const hrefs = [...getByTestId("api-reference-specs").querySelectorAll("a")]
      .map((a) => a.getAttribute("href"))
      .sort();
    expect(hrefs).toEqual(
      [
        "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
        "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
        "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
        "https://hl7.org/fhir/R4/",
        "https://ohdsi.github.io/CommonDataModel/cdm54.html",
      ].sort(),
    );
  });

  it("points the in-page client at the page's own origin", () => {
    render(<ApiReferencePage />);
    expect(scalar.configuration?.baseServerURL).toBe(window.location.origin);
    expect(scalar.configuration?.url).toBe("/openapi.yaml");
  });
});
