/**
 * The simulated wallet follows the language picker (#782, ADR-070): its
 * screens, buttons and tab bar, while d-you and the protocol names stay.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import {
  EHR_TRANSFER_STEPS,
  LOGIN_STEPS,
  REGISTER_STEPS,
} from "@/components/wallet/flows";
import { EudiApprovalFlow } from "@/components/wallet/EudiApprovalFlow";
import { setLanguage } from "@/lib/use-language";

afterEach(() => {
  act(() => setLanguage("en"));
  localStorage.clear();
});

describe("the simulated wallet in the picked language", () => {
  it("shows d-you's dashboard in German, tab bar included", () => {
    render(<WalletFlow theme="dyou" loop={false} steps={REGISTER_STEPS} />);
    act(() => setLanguage("de"));
    expect(screen.getByText("Digitaler Ausweis")).toBeInTheDocument();
    expect(screen.getByText("Bundesrepublik Deutschland")).toBeInTheDocument();
    expect(screen.getByText("Übersicht")).toBeInTheDocument();
    expect(screen.getByText("Einstellungen")).toBeInTheDocument();
    expect(screen.getByText("QR-Code scannen")).toBeInTheDocument();
    expect(
      screen.getByText("Am 14. Mai geprüft · Nachweis und Daten geteilt"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Digital ID")).toBeNull();
  });

  it("asks for consent in French, buttons and dismiss cross included", () => {
    render(
      <WalletFlow theme="dyou" interactive loop={false} steps={LOGIN_STEPS} />,
    );
    act(() => setLanguage("fr"));
    expect(
      screen.getByText("Ce service demande des données :"),
    ).toBeInTheDocument();
    expect(screen.getByText("Finalité")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fermer la demande" }),
    ).toBeInTheDocument();
  });

  it("shows the insurer's app in Dutch with the ePA in bold and the cancel button", () => {
    render(<WalletFlow interactive loop={false} steps={EHR_TRANSFER_STEPS} />);
    act(() => setLanguage("nl"));
    expect(
      screen.getByText("Uw gezondheidsdossier koppelen"),
    ).toBeInTheDocument();
    expect(screen.getByText("ePA").tagName).toBe("STRONG");
    expect(
      screen.getByRole("button", { name: "Authenticeren" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Annuleren" }),
    ).toBeInTheDocument();
  });

  it("names the approval phone in Spanish", () => {
    render(<EudiApprovalFlow mode="register" onComplete={() => {}} />);
    act(() => setLanguage("es"));
    expect(
      screen.getByRole("group", { name: "Aprobar el registro con d-you" }),
    ).toBeInTheDocument();
  });
});
