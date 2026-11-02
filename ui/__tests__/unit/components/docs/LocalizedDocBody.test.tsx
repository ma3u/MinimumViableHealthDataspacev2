/**
 * A published document in the picked language (ADR-071): the page renders
 * the English body on the server; in another language the client fetches
 * the translation and swaps it in, with lang set on it. No translation, or
 * one that cannot be fetched: English with a note. A stale translation: the
 * translation with a note and a way to read the English.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/MermaidDiagram", () => ({
  default: ({ chart }: { chart: string }) => (
    <pre data-testid="mermaid-diagram">{chart}</pre>
  ),
}));

// The index as the generator writes it: German current, Dutch stale, no
// French or Spanish.
vi.mock("@/content/published-docs-i18n.json", () => ({
  default: {
    languages: ["de", "fr", "nl", "es"],
    docs: {
      "security/sbom": {
        de: { status: "current", title: "Software-Stücklisten" },
        nl: { status: "stale", title: "Software-stuklijsten" },
      },
    },
  },
}));

import { PublishedDocPage } from "@/components/docs/PublishedDoc";
import { findDoc } from "@/lib/docs/published-docs";

const doc = findDoc("security", "sbom")!;
const fetchMock = vi.fn();

function renderDoc(lang: string) {
  localStorage.setItem("catalog-metadata-language", lang);
  return render(
    <PublishedDocPage
      doc={doc}
      backHref="/docs/security"
      backLabel="Security and Data Protection"
      lastUpdatedPage="/docs/security/[slug]"
    />,
  );
}

function answer(markdown: string) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ markdown }), { status: 200 }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("a published document in the picked language", () => {
  it("is the English body in English, with nothing fetched", () => {
    renderDoc("en");
    expect(
      screen.getByRole("heading", { name: /Software bills of materials/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("doc-translation-note")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swaps in a current translation, in its language", async () => {
    answer("# Software-Stücklisten\n\nEine Datei je Teil.");
    renderDoc("de");
    const body = await screen.findByTestId("published-doc-translation");
    expect(body).toHaveAttribute("lang", "de");
    expect(body).toHaveTextContent("Eine Datei je Teil.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/published-docs/i18n/de/security/sbom.json",
    );
    expect(
      screen.queryByRole("heading", { name: /Software bills of materials/ }),
    ).toBeNull();
    expect(screen.queryByTestId("doc-translation-note")).toBeNull();
  });

  it("shows English with a note when there is no translation", async () => {
    renderDoc("fr");
    expect(
      await screen.findByText("Pas encore traduit en français."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Software bills of materials/ }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a stale translation with a note and the English on request", async () => {
    answer("# Software-stuklijsten\n\nEen bestand per onderdeel.");
    renderDoc("nl");
    expect(
      await screen.findByText(
        /Het Engelse origineel is na deze vertaling gewijzigd\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("published-doc-translation")).toHaveTextContent(
      "Een bestand per onderdeel.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Het Engelse origineel lezen" }),
    );
    expect(
      screen.getByRole("heading", { name: /Software bills of materials/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("published-doc-translation")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Terug naar de vertaling" }),
    );
    expect(screen.getByTestId("published-doc-translation")).toBeInTheDocument();
  });

  it("stays English, with the note, when the translation cannot be fetched", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    renderDoc("de");
    expect(
      await screen.findByText("Noch nicht auf Deutsch übersetzt."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Software bills of materials/ }),
      ).toBeInTheDocument(),
    );
  });
});
