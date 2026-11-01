/**
 * The language picker in the menu bar (#782): it names each language in
 * itself, stores the choice and tells every reader in the tab at once.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguagePicker from "@/components/LanguagePicker";
import { useLanguage } from "@/lib/use-language";

function Reader() {
  return <p data-testid="reader">{useLanguage()}</p>;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("LanguagePicker", () => {
  it("offers English, German, French and Dutch, each in its own name", () => {
    render(<LanguagePicker />);
    const select = screen.getByRole("combobox", { name: "Language" });
    const options = Array.from(select.querySelectorAll("option")).map((o) => [
      o.value,
      o.textContent,
      o.getAttribute("lang"),
    ]);
    expect(options).toEqual([
      ["en", "English", "en"],
      ["de", "Deutsch", "de"],
      ["fr", "Français", "fr"],
      ["nl", "Nederlands", "nl"],
    ]);
  });

  it("stores the choice and every reader in the tab follows", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LanguagePicker />
        <Reader />
      </>,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Language" }),
      "fr",
    );
    expect(screen.getByTestId("reader")).toHaveTextContent("fr");
    expect(localStorage.getItem("catalog-metadata-language")).toBe("fr");
  });

  it("starts in the browser's language when nothing was chosen", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["nl-BE", "fr"]);
    render(<LanguagePicker />);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue(
        "nl",
      ),
    );
  });

  it("keeps a stored choice over the browser's language", async () => {
    localStorage.setItem("catalog-metadata-language", "en");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);
    render(<LanguagePicker />);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue(
        "en",
      ),
    );
  });
});
