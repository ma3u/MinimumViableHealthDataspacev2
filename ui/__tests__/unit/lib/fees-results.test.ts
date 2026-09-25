/**
 * Fees (Art. 62) and the results deadline (Art. 61(4)). Issue #206, M6 and M7.
 */
import { describe, it, expect } from "vitest";
import { CATEGORY_REDUCTION, REQUEST_FEE_EUR, estimateFee } from "@/lib/fees";
import { RESULT_KINDS, resultsDeadline } from "@/lib/results";

describe("estimateFee (Art. 62)", () => {
  it("adds the body's and the holder's costs for a commercial applicant", () => {
    const f = estimateFee({
      applicantCategory: "COMMERCIAL",
      processingPeriodMonths: 12,
      identifiability: "PSEUDONYMISED",
    });
    expect(f.bodyEur).toBe(1500 + 250 + 12 * 50);
    expect(f.holderEur).toBe(2000);
    expect(f.totalEur).toBe(f.bodyEur + f.holderEur);
    expect(f.reduction).toBe(0);
    expect(f.article).toContain("Art. 62");
  });

  it("reduces the fee for the categories of Art. 62(3)", () => {
    const academic = estimateFee({
      applicantCategory: "ACADEMIC",
      processingPeriodMonths: 12,
      identifiability: "PSEUDONYMISED",
    });
    expect(academic.reduction).toBe(0.5);
    expect(academic.totalEur).toBe(Math.round((2350 + 2000) * 0.5));
    expect(academic.basis.join(" ")).toContain("reduced by 50%");
    const publicBody = estimateFee({ applicantCategory: "PUBLIC_SECTOR" });
    expect(publicBody.reduction).toBe(0.75);
    expect(CATEGORY_REDUCTION.MICRO_ENTERPRISE).toBe(0.5);
  });

  it("charges the holder less for anonymised data and falls back to commercial", () => {
    const f = estimateFee({
      identifiability: "ANONYMISED",
      processingPeriodMonths: 6,
    });
    expect(f.category).toBe("COMMERCIAL");
    expect(f.holderEur).toBe(800);
    expect(f.bodyEur).toBe(1500 + 250 + 6 * 50);
    expect(REQUEST_FEE_EUR).toBe(300);
  });
});

describe("resultsDeadline (Art. 61(4))", () => {
  it("is eighteen months after the end of the processing", () => {
    expect(resultsDeadline("2027-02-20T23:59:59Z")).toBe(
      "2028-08-20T23:59:59.000Z",
    );
    expect(resultsDeadline(null)).toBeNull();
    expect(RESULT_KINDS).toContain("IT_PRODUCT");
  });
});
