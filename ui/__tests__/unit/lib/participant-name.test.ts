import { describe, it, expect } from "vitest";
import { didToName } from "@/lib/participant-name";

describe("didToName", () => {
  it("names an EDC-layer DID by its slug", () => {
    expect(didToName("did:web:identityhub%3A7083:lmc")).toBe(
      "Limburg Medical Centre",
    );
    expect(didToName("did:web:identityhub%3A7083:alpha-klinik")).toBe(
      "AlphaKlinik Berlin",
    );
  });

  it("names a graph-layer DID by its host, not its role segment", () => {
    expect(didToName("did:web:lmc.nl:clinic")).toBe("Limburg Medical Centre");
    expect(didToName("did:web:alpha-klinik.de:participant")).toBe(
      "AlphaKlinik Berlin",
    );
    expect(didToName("did:web:pharmaco.de:research")).toBe(
      "PharmaCo Research AG",
    );
    expect(didToName("did:web:irs.fr:hdab")).toBe(
      "Institut de Recherche Santé",
    );
  });

  it("falls back to the last segment for an unknown DID", () => {
    expect(didToName("did:web:example.org:someone")).toBe("someone");
  });
});
