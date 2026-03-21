/**
 * Comprehensive tests for the CatalogEditorPage (HealthDCAT-AP Editor).
 *
 * Covers: loading state, browse tab rendering, empty state, dataset card info,
 * tab switching, create form rendering, form fields, form validation,
 * form submission (success / error / network error), edit flow, deep-link
 * ?edit=id, delete flow, cancel button, saving state, checkbox fields,
 * statistics fields, browse count badge, POST body verification, and
 * update flow messaging.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────
const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
}));

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

import DcatApEditorPage from "@/app/catalog/editor/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

function mockTextResponse(text: string, ok = false) {
  return Promise.resolve({
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(text),
    ok,
  });
}

// ── Mock data ────────────────────────────────────────────────────────
interface DatasetEntry {
  id: string;
  title: string;
  description: string;
  publisher: string;
  publisherType: string;
  theme: string;
  language: string;
  license: string;
  conformsTo: string;
  spatial: string;
  datasetType: string;
  legalBasis: string;
  purpose: string;
  populationCoverage: string;
  healthCategory: string;
  personalData: boolean;
  sensitiveData: boolean;
  recordCount: number;
  numberOfUniqueIndividuals: number;
  minTypicalAge: number;
  maxTypicalAge: number;
}

const DATASET_A: DatasetEntry = {
  id: "dataset:synthetic-fhir-cohort-abc",
  title: "Synthetic FHIR R4 Patient Cohort",
  description: "A synthetic cohort of 10,000 FHIR R4 patients for research.",
  publisher: "AlphaKlinik Berlin",
  publisherType: "DataHolder",
  theme: "Clinical Research",
  language: "en",
  license: "CC-BY-4.0",
  conformsTo: "http://hl7.org/fhir/R4",
  spatial: "DE",
  datasetType: "SyntheticData",
  legalBasis: "EHDS Article 53 Secondary Use",
  purpose: "Secondary use for public health research",
  populationCoverage: "Adult patients (18+) in Berlin region",
  healthCategory: "Patient Summary",
  personalData: false,
  sensitiveData: false,
  recordCount: 10000,
  numberOfUniqueIndividuals: 500,
  minTypicalAge: 18,
  maxTypicalAge: 90,
};

const DATASET_B: DatasetEntry = {
  id: "dataset:cancer-registry-xyz",
  title: "Cancer Registry Limburg",
  description: "Regional cancer registry data for secondary use.",
  publisher: "Limburg Medical Centre",
  publisherType: "DataHolder",
  theme: "Cancer Registry",
  language: "nl",
  license: "CC-BY-NC-4.0",
  conformsTo: "http://hl7.org/fhir/R4",
  spatial: "NL",
  datasetType: "Registry",
  legalBasis: "GDPR Article 9(2)(j) Research",
  purpose: "Cancer epidemiology studies",
  populationCoverage: "All ages Limburg province",
  healthCategory: "Cancer Registry",
  personalData: true,
  sensitiveData: true,
  recordCount: 5000,
  numberOfUniqueIndividuals: 3000,
  minTypicalAge: 0,
  maxTypicalAge: 100,
};

const TWO_DATASETS = [DATASET_A, DATASET_B];

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  mockFetchApi.mockReset();
  mockSearchParams.mockReturnValue(new URLSearchParams());
});

// ── Tests ────────────────────────────────────────────────────────────

describe("CatalogEditorPage", () => {
  // ─── Loading State ───────────────────────────────────────────────
  describe("Loading state", () => {
    it("shows loading spinner on mount", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<DcatApEditorPage />);
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });

    it("calls fetchApi for /api/catalog on mount", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<DcatApEditorPage />);
      expect(mockFetchApi).toHaveBeenCalledWith("/api/catalog");
    });
  });

  // ─── Browse Tab ──────────────────────────────────────────────────
  describe("Browse tab", () => {
    it("renders dataset cards after loading", async () => {
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
        expect(screen.getByText("Cancer Registry Limburg")).toBeInTheDocument();
      });
    });

    it("renders HealthDCAT-AP Editor heading", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/HealthDCAT-AP Editor/i)).toBeInTheDocument();
      });
    });

    it("shows empty state with 'Create one' link when no entries", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/No HealthDCAT-AP entries yet/i),
        ).toBeInTheDocument();
        expect(screen.getByText("Create one")).toBeInTheDocument();
      });
    });

    it("clicking 'Create one' link switches to create tab", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Create one")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Create one"));

      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });
    });
  });

  // ─── Dataset Card Info ───────────────────────────────────────────
  describe("Dataset card info", () => {
    it("displays dataset title", async () => {
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });
    });

    it("displays dataset description", async () => {
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText(
            "A synthetic cohort of 10,000 FHIR R4 patients for research.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("displays publisher name", async () => {
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
    });

    it("displays theme badge", async () => {
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Clinical Research")).toBeInTheDocument();
      });
    });

    it("displays dataset type badge", async () => {
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("SyntheticData")).toBeInTheDocument();
      });
    });

    it("displays record count", async () => {
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/10,000 records/)).toBeInTheDocument();
      });
    });

    it("does not display record count when null", async () => {
      const noRecords = { ...DATASET_A, recordCount: null };
      mockFetchApi.mockReturnValue(mockResponse([noRecords]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/records/)).not.toBeInTheDocument();
    });
  });

  // ─── Browse Count Badge ──────────────────────────────────────────
  describe("Browse count badge", () => {
    it("shows dataset count on Browse tab button", async () => {
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse \(2\)/)).toBeInTheDocument();
      });
    });

    it("shows zero count when no datasets", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse \(0\)/)).toBeInTheDocument();
      });
    });
  });

  // ─── Tab Switching ───────────────────────────────────────────────
  describe("Tab switching", () => {
    it("switches from Browse to Create tab", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });
    });

    it("switches from Create back to Browse tab", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Browse/));
      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── Create Form Rendering ──────────────────────────────────────
  describe("Create form rendering", () => {
    async function renderCreateTab() {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse \(0\)/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });
      return user;
    }

    it("renders DCAT-AP Mandatory Fields fieldset", async () => {
      await renderCreateTab();
      expect(screen.getByText("DCAT-AP Mandatory Fields")).toBeInTheDocument();
    });

    it("renders DCAT-AP Recommended Fields fieldset", async () => {
      await renderCreateTab();
      expect(
        screen.getByText("DCAT-AP Recommended Fields"),
      ).toBeInTheDocument();
    });

    it("renders HealthDCAT-AP Extensions fieldset", async () => {
      await renderCreateTab();
      expect(screen.getByText("HealthDCAT-AP Extensions")).toBeInTheDocument();
    });

    it("renders Statistics fieldset", async () => {
      await renderCreateTab();
      expect(screen.getByText("Statistics")).toBeInTheDocument();
    });

    it("renders Title field with required marker", async () => {
      await renderCreateTab();
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Synthetic FHIR/)).toBeInTheDocument();
    });

    it("renders Description textarea", async () => {
      await renderCreateTab();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/Describe the dataset/),
      ).toBeInTheDocument();
    });

    it("renders Publisher select", async () => {
      await renderCreateTab();
      expect(screen.getByText("Publisher")).toBeInTheDocument();
    });

    it("renders Theme select", async () => {
      await renderCreateTab();
      expect(screen.getByText("Theme")).toBeInTheDocument();
    });

    it("renders Language field", async () => {
      await renderCreateTab();
      expect(screen.getByText("Language")).toBeInTheDocument();
    });

    it("renders Conforms To field", async () => {
      await renderCreateTab();
      expect(screen.getByText("Conforms To")).toBeInTheDocument();
    });

    it("renders Legal Basis select", async () => {
      await renderCreateTab();
      expect(screen.getByText("Legal Basis for Access")).toBeInTheDocument();
    });

    it("renders Cancel button", async () => {
      await renderCreateTab();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  // ─── Form Validation ────────────────────────────────────────────
  describe("Form validation", () => {
    it("submit button is disabled when title is empty", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });

      const submitBtn = screen.getByText("Create Entry").closest("button")!;
      expect(submitBtn).toBeDisabled();
    });

    it("submit button is enabled when title is filled", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });

      const titleInput = screen.getByPlaceholderText(/Synthetic FHIR/);
      await user.type(titleInput, "My Test Dataset");

      const submitBtn = screen.getByText("Create Entry").closest("button")!;
      expect(submitBtn).not.toBeDisabled();
    });
  });

  // ─── Form Submission Success ─────────────────────────────────────
  describe("Form submission success", () => {
    it("shows success banner after creating", async () => {
      const user = userEvent.setup();
      // First call: initial load; second call: POST; third call: reload
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "New Dataset",
      );
      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        expect(screen.getByText(/created successfully/i)).toBeInTheDocument();
      });
    });

    it("reloads catalog after successful save", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await user.type(screen.getByPlaceholderText(/Synthetic FHIR/), "Test");
      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        // Initial load + POST + reload = 3 calls
        expect(mockFetchApi).toHaveBeenCalledTimes(3);
      });
    });

    it("switches to browse tab after successful create (with delay)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });

      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await user.type(screen.getByPlaceholderText(/Synthetic FHIR/), "Test");
      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        expect(screen.getByText(/created successfully/i)).toBeInTheDocument();
      });

      // The component uses setTimeout 1500ms to switch to browse
      vi.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  // ─── Form Submission Error ───────────────────────────────────────
  describe("Form submission error", () => {
    it("shows error banner on server error", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockTextResponse("Validation failed"));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Bad Dataset",
      );
      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        expect(screen.getByText("Validation failed")).toBeInTheDocument();
      });
    });

    it("shows generic error when server returns empty body", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockTextResponse(""));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Failing Dataset",
      );
      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        expect(screen.getByText("Failed to save.")).toBeInTheDocument();
      });
    });

    it("shows network error message on fetch rejection", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockRejectedValueOnce(new Error("Connection refused"));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Offline Dataset",
      );
      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        expect(
          screen.getByText(/Network error: Connection refused/i),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── Edit Flow ───────────────────────────────────────────────────
  describe("Edit flow", () => {
    it("click Edit button populates form and shows 'Update Entry'", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      const editBtn = screen.getByTitle("Edit entry");
      await user.click(editBtn);

      await waitFor(() => {
        expect(screen.getByText("Update Entry")).toBeInTheDocument();
      });

      // Title field should be populated
      const titleInput = screen.getByPlaceholderText(
        /Synthetic FHIR/,
      ) as HTMLInputElement;
      expect(titleInput.value).toBe("Synthetic FHIR R4 Patient Cohort");
    });

    it("shows editing indicator with dataset ID", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Edit entry"));

      await waitFor(() => {
        expect(screen.getByText(DATASET_A.id)).toBeInTheDocument();
      });
    });

    it("shows update success message when editing existing dataset", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([DATASET_A]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Edit entry"));
      await waitFor(() => {
        expect(screen.getByText("Update Entry")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Update Entry"));

      await waitFor(() => {
        expect(screen.getByText(/updated successfully/i)).toBeInTheDocument();
      });
    });

    it("populates description field when editing", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Edit entry"));

      await waitFor(() => {
        const descTextarea = screen.getByPlaceholderText(
          /Describe the dataset/,
        ) as HTMLTextAreaElement;
        expect(descTextarea.value).toBe(DATASET_A.description);
      });
    });
  });

  // ─── Deep-link ?edit=id ──────────────────────────────────────────
  describe("Deep-link ?edit=id", () => {
    it("auto-populates form when ?edit=<id> matches a dataset", async () => {
      mockSearchParams.mockReturnValue(
        new URLSearchParams(`edit=${DATASET_A.id}`),
      );
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Update Entry")).toBeInTheDocument();
      });

      const titleInput = screen.getByPlaceholderText(
        /Synthetic FHIR/,
      ) as HTMLInputElement;
      expect(titleInput.value).toBe("Synthetic FHIR R4 Patient Cohort");
    });

    it("stays on browse when ?edit=<id> does not match any dataset", async () => {
      mockSearchParams.mockReturnValue(
        new URLSearchParams("edit=dataset:nonexistent"),
      );
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      // Should NOT switch to create tab
      expect(screen.queryByText("Update Entry")).not.toBeInTheDocument();
    });
  });

  // ─── Delete Flow ─────────────────────────────────────────────────
  describe("Delete flow", () => {
    it("calls DELETE /api/catalog?id=<id> when delete is clicked", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([DATASET_A]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Delete entry"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          `/api/catalog?id=${encodeURIComponent(DATASET_A.id)}`,
          { method: "DELETE" },
        );
      });
    });

    it("reloads catalog after successful delete", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse(TWO_DATASETS))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([DATASET_B]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      // Click delete on first dataset
      const deleteButtons = screen.getAllByTitle("Delete entry");
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        // 3 calls: initial load + DELETE + reload
        expect(mockFetchApi).toHaveBeenCalledTimes(3);
      });
    });
  });

  // ─── Cancel Button ───────────────────────────────────────────────
  describe("Cancel button", () => {
    it("resets form and switches to Browse tab", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      // Switch to create tab and fill in title
      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Temporary Title",
      );

      // Click Cancel
      await user.click(screen.getByText("Cancel"));

      // Should be back on browse tab
      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });
    });

    it("clears editing state when cancelling an edit", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      // Start editing
      await user.click(screen.getByTitle("Edit entry"));
      await waitFor(() => {
        expect(screen.getByText("Update Entry")).toBeInTheDocument();
      });

      // Cancel
      await user.click(screen.getByText("Cancel"));

      // Go back to create — should show "Create Entry" not "Update Entry"
      await user.click(screen.getByText(/New Entry/));
      await waitFor(() => {
        expect(screen.getByText("Create Entry")).toBeInTheDocument();
        expect(screen.queryByText("Update Entry")).not.toBeInTheDocument();
      });
    });
  });

  // ─── Saving State ───────────────────────────────────────────────
  describe("Saving state", () => {
    it("disables submit button during save", async () => {
      const user = userEvent.setup();
      let resolvePost: (v: unknown) => void;
      const pendingPost = new Promise((r) => {
        resolvePost = r;
      });

      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(pendingPost);
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));
      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Saving Test",
      );

      const submitBtn = screen.getByText("Create Entry").closest("button")!;
      await user.click(submitBtn);

      // Button should be disabled while saving
      await waitFor(() => {
        // The button text changes during saving — look for the disabled button
        const buttons = screen.getAllByRole("button");
        const submit = buttons.find((b) => b.getAttribute("type") === "submit");
        expect(submit).toBeDisabled();
      });

      // Resolve to clean up
      resolvePost!({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      });
    });
  });

  // ─── Checkbox Fields ─────────────────────────────────────────────
  describe("Checkbox fields", () => {
    it("renders personal data checkbox unchecked by default", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      await waitFor(() => {
        expect(screen.getByText("Contains Personal Data")).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole("checkbox");
      // Both personal data and sensitive data checkboxes
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
      checkboxes.forEach((cb) => {
        expect(cb).not.toBeChecked();
      });
    });

    it("can toggle personal data checkbox", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[0]); // personal data
      expect(checkboxes[0]).toBeChecked();
    });

    it("can toggle sensitive data checkbox", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]); // sensitive data
      expect(checkboxes[1]).toBeChecked();
    });

    it("populates checkboxes when editing dataset with true values", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(
        mockResponse([
          { ...DATASET_B, personalData: true, sensitiveData: true },
        ]),
      );
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Cancer Registry Limburg")).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Edit entry"));

      await waitFor(() => {
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes[0]).toBeChecked();
        expect(checkboxes[1]).toBeChecked();
      });
    });
  });

  // ─── Statistics Fields ───────────────────────────────────────────
  describe("Statistics fields", () => {
    it("renders number input fields for statistics", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("e.g. 10000")).toBeInTheDocument(); // Number of Records
        expect(screen.getByPlaceholderText("e.g. 500")).toBeInTheDocument(); // Unique Individuals
        expect(screen.getByPlaceholderText("e.g. 18")).toBeInTheDocument(); // Min Typical Age
        expect(screen.getByPlaceholderText("e.g. 90")).toBeInTheDocument(); // Max Typical Age
      });
    });

    it("number fields accept numeric input", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      const recordsInput = screen.getByPlaceholderText(
        "e.g. 10000",
      ) as HTMLInputElement;
      await user.type(recordsInput, "5000");
      expect(recordsInput.value).toBe("5000");
    });

    it("populates statistics when editing", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Edit entry"));

      await waitFor(() => {
        const recordsInput = screen.getByPlaceholderText(
          "e.g. 10000",
        ) as HTMLInputElement;
        expect(recordsInput.value).toBe("10000");

        const individualsInput = screen.getByPlaceholderText(
          "e.g. 500",
        ) as HTMLInputElement;
        expect(individualsInput.value).toBe("500");

        const minAgeInput = screen.getByPlaceholderText(
          "e.g. 18",
        ) as HTMLInputElement;
        expect(minAgeInput.value).toBe("18");

        const maxAgeInput = screen.getByPlaceholderText(
          "e.g. 90",
        ) as HTMLInputElement;
        expect(maxAgeInput.value).toBe("90");
      });
    });
  });

  // ─── POST Body Verification ──────────────────────────────────────
  describe("POST body verification", () => {
    it("sends correct payload for new dataset creation", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      // Fill in title
      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Test Dataset",
      );

      // Fill in description
      await user.type(
        screen.getByPlaceholderText(/Describe the dataset/),
        "A test description",
      );

      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          "/api/catalog",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      // Verify the body content
      const postCall = mockFetchApi.mock.calls.find(
        (call: unknown[]) =>
          call.length > 1 &&
          (call[1] as Record<string, unknown>)?.method === "POST",
      );
      expect(postCall).toBeDefined();

      const body = JSON.parse((postCall![1] as Record<string, string>).body);
      expect(body.title).toBe("Test Dataset");
      expect(body.description).toBe("A test description");
      expect(body.id).toMatch(/^dataset:test-dataset-/);
      expect(body.license).toBe("CC-BY-4.0");
      expect(body.conformsTo).toBe("http://hl7.org/fhir/R4");
      expect(body.language).toBe("en");
      expect(body.personalData).toBe(false);
      expect(body.sensitiveData).toBe(false);
      expect(body.recordCount).toBeNull();
    });

    it("sends existing ID when updating a dataset", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([DATASET_A]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([DATASET_A]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Edit entry"));
      await waitFor(() => {
        expect(screen.getByText("Update Entry")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Update Entry"));

      await waitFor(() => {
        const postCall = mockFetchApi.mock.calls.find(
          (call: unknown[]) =>
            call.length > 1 &&
            (call[1] as Record<string, unknown>)?.method === "POST",
        );
        expect(postCall).toBeDefined();
        const body = JSON.parse((postCall![1] as Record<string, string>).body);
        expect(body.id).toBe(DATASET_A.id);
      });
    });

    it("converts numeric strings to numbers in payload", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ ok: true }))
        .mockReturnValueOnce(mockResponse([]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText(/Browse/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/New Entry/));

      await user.type(
        screen.getByPlaceholderText(/Synthetic FHIR/),
        "Numeric Test",
      );
      await user.type(screen.getByPlaceholderText("e.g. 10000"), "1234");
      await user.type(screen.getByPlaceholderText("e.g. 500"), "567");
      await user.type(screen.getByPlaceholderText("e.g. 18"), "25");
      await user.type(screen.getByPlaceholderText("e.g. 90"), "80");

      await user.click(screen.getByText("Create Entry"));

      await waitFor(() => {
        const postCall = mockFetchApi.mock.calls.find(
          (call: unknown[]) =>
            call.length > 1 &&
            (call[1] as Record<string, unknown>)?.method === "POST",
        );
        const body = JSON.parse((postCall![1] as Record<string, string>).body);
        expect(body.recordCount).toBe(1234);
        expect(body.numberOfUniqueIndividuals).toBe(567);
        expect(body.minTypicalAge).toBe(25);
        expect(body.maxTypicalAge).toBe(80);
      });
    });
  });

  // ─── Multiple Datasets Rendering ────────────────────────────────
  describe("Multiple datasets", () => {
    it("renders all datasets in the list", async () => {
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
        expect(screen.getByText("Cancer Registry Limburg")).toBeInTheDocument();
      });
    });

    it("shows edit and delete buttons for each dataset", async () => {
      mockFetchApi.mockReturnValue(mockResponse(TWO_DATASETS));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        const editBtns = screen.getAllByTitle("Edit entry");
        const deleteBtns = screen.getAllByTitle("Delete entry");
        expect(editBtns).toHaveLength(2);
        expect(deleteBtns).toHaveLength(2);
      });
    });
  });

  // ─── Error Handling Edge Cases ───────────────────────────────────
  describe("Error handling edge cases", () => {
    it("handles catalog load error gracefully", async () => {
      mockFetchApi.mockRejectedValue(new Error("Server down"));
      render(<DcatApEditorPage />);

      // Should not crash — eventually loading should stop
      await waitFor(() => {
        // Component catches error and sets loading = false
        expect(screen.getByText(/Browse \(0\)/)).toBeInTheDocument();
      });
    });

    it("handles delete error silently", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([DATASET_A]))
        .mockRejectedValueOnce(new Error("Delete failed"));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Synthetic FHIR R4 Patient Cohort"),
        ).toBeInTheDocument();
      });

      // Should not throw
      await user.click(screen.getByTitle("Delete entry"));

      // Dataset should still be visible (no reload happened)
      expect(
        screen.getByText("Synthetic FHIR R4 Patient Cohort"),
      ).toBeInTheDocument();
    });
  });

  // ─── Dataset with missing optional fields ────────────────────────
  describe("Partial dataset rendering", () => {
    it("renders dataset card without optional fields", async () => {
      const minimal = {
        id: "dataset:minimal",
        title: "Minimal Dataset",
        description: "",
        publisher: "",
        theme: "",
        datasetType: "",
        recordCount: null,
        license: "CC-BY-4.0",
        conformsTo: "",
        legalBasis: "",
      };
      mockFetchApi.mockReturnValue(mockResponse([minimal]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Minimal Dataset")).toBeInTheDocument();
      });

      // Should not show badges for empty fields
      expect(screen.queryByText(/records/)).not.toBeInTheDocument();
    });

    it("falls back to ID when title is empty", async () => {
      const noTitle = {
        id: "dataset:no-title-abc",
        title: "",
        description: "Has no title",
        publisher: "",
        theme: "",
        datasetType: "",
        recordCount: null,
        license: "CC-BY-4.0",
        conformsTo: "",
        legalBasis: "",
      };
      mockFetchApi.mockReturnValue(mockResponse([noTitle]));
      render(<DcatApEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("dataset:no-title-abc")).toBeInTheDocument();
      });
    });
  });
});
