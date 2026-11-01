/**
 * The explore pages' labels that come from a library (#782, ADR-070): the
 * graph explorer's constants, its legend and relationships, the overview
 * builders' fixed texts and the journey's data sources. They are translated
 * where they are shown, so the i18n test's search for t("...") literals does
 * not see them; this one lists them and finds each in the explore area.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MESSAGES } from "@/messages";
import { translate } from "@/lib/i18n/translate";
import { graphKey } from "@/app/graph/_lib/graph-text";
import * as G from "@/lib/graph-constants";
import { donationSources, insurer } from "@/lib/journey-config";

const explore = MESSAGES.en.explore as Record<string, string>;
const src = (f: string) => readFileSync(path.resolve(f), "utf8");
const unknown = (texts: string[]) => texts.filter((x) => !(x in explore));

describe("graphKey", () => {
  const dash = String.fromCharCode(0x2014);

  it("reads an em dash as a colon after a name", () => {
    expect(graphKey(`FHIR R4 Patient ${dash} the record`)).toBe(
      "FHIR R4 Patient: the record",
    );
  });

  it("reads it as a comma where the sentence goes on", () => {
    expect(graphKey(`a, b, c ${dash} with d`)).toBe("a, b, c, with d");
    expect(graphKey(`Your journey ${dash} a, b ${dash} and c`)).toBe(
      "Your journey: a, b, and c",
    );
  });

  it("leaves a label without one alone", () => {
    expect(graphKey("Art. 33–37")).toBe("Art. 33–37");
  });
});

describe("the explore area knows every label the explore pages take from a library", () => {
  it("knows every label of lib/graph-constants the graph explorer shows", () => {
    const presets = [
      ...G.FILTER_PRESETS,
      ...G.PATIENT_FILTER_PRESETS,
      ...G.HOSPITAL_FILTER_PRESETS,
      ...G.HDAB_FILTER_PRESETS,
      ...G.RESEARCHER_FILTER_PRESETS,
    ];
    const texts = [
      ...Object.values(G.LAYER_LABELS),
      ...Object.values(G.PERSONA_LAYER_LABELS).flatMap((m) =>
        Object.values(m ?? {}),
      ),
      ...Object.values(G.LAYER_TOOLTIPS),
      ...Object.values(G.NODE_DISPLAY_NAMES),
      ...Object.values(G.NODE_TOOLTIPS),
      ...presets.flatMap((p) => [p.label, p.description]),
      ...Object.values(G.PERSONA_VALUE_NODES).flatMap((v) => [
        v.name,
        v.tooltip,
      ]),
      ...G.PERSONA_VIEWS.map((v) => v.label),
    ].map(graphKey);
    expect(texts.length).toBeGreaterThan(150);
    expect(unknown(texts)).toEqual([]);
  });

  it("knows the graph page's legend and relationship names", () => {
    const page = src("src/app/graph/page.tsx");
    const legend = page.match(/const ROLE_LEGEND[\s\S]*?\n\];/)![0];
    const rels = page.match(/const FRIENDLY_REL_NAMES[\s\S]*?\n\};/)![0];
    const texts = [
      ...[...legend.matchAll(/\b(?:label|description|tooltip): "([^"]+)"/g)]
        .map((m) => m[1])
        .map(graphKey),
      ...[...rels.matchAll(/^\s+[A-Z_]+: "([^"]+)",/gm)].map((m) => m[1]),
    ];
    expect(texts.length).toBeGreaterThan(40);
    expect(unknown(texts)).toEqual([]);
  });

  it("knows the overview builders' titles, questions, layers, legends and links", () => {
    const texts: string[] = [];
    for (const f of ["hdab", "hospital", "patient", "researcher"]) {
      const s = src(`src/lib/overview/${f}.ts`);
      const legend = s.match(/legend:\s*\[([\s\S]*?)\]/)![1];
      for (const re of [
        /title:\s*"([^"]+)",\s*question:/g,
        /question:\s*"([^"]+)"/g,
        /dataNote:\s*"([^"]+)"/g,
        /name:\s*"([^"]+)",\s*z:/g,
        /href:[^{}]*?text:\s*"([^"]+)"/g,
      ]) {
        texts.push(...[...s.matchAll(re)].map((m) => m[1]));
      }
      texts.push(
        ...[...legend.matchAll(/text:\s*"([^"]+)"/g)].map((m) => m[1]),
      );
    }
    expect(texts.length).toBeGreaterThan(60);
    expect(unknown(texts)).toEqual([]);
  });

  it("knows the journey's data sources, except the insurer's name", () => {
    const texts = donationSources
      .flatMap((s) => [s.label, s.sublabel])
      .filter((x) => !x.includes(insurer.short));
    expect(texts.length).toBeGreaterThanOrEqual(5);
    expect(unknown(texts)).toEqual([]);
  });
});

describe("the explore pages in another language", () => {
  it("say the access body's term as the Regulation does", () => {
    expect(
      translate(
        "de",
        "explore",
        "EHDS Art. 68: data permit issued or refused by the health data access body",
      ),
    ).toContain("Datengenehmigung");
    expect(translate("fr", "explore", "EHDS Patient Wallet")).toContain("EEDS");
  });
});
