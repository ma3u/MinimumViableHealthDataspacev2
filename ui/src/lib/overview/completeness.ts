/**
 * Art. 77 dataset description completeness (issue #271 M6).
 *
 * The national catalogue describes each dataset with the HealthDCAT-AP
 * fields; Art. 77(1) obliges the holder to describe the dataset and
 * Art. 79 the access body to publish the catalogue. This scores how much of
 * the description a catalogue entry carries, as the first cut of a
 * completeness figure: the presence of the fields, not their quality.
 */

export interface CatalogEntryLike {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  license?: string | null;
  conformsTo?: string[] | string | null;
  publisher?: string | null;
  theme?: string | null;
  datasetType?: string | null;
  legalBasis?: string | null;
  recordCount?: number | null;
}

/** The fields Art. 77 expects a description to carry, in the words of the catalogue. */
export const DESCRIPTION_FIELDS: {
  key: keyof CatalogEntryLike;
  label: string;
  filled: (v: unknown) => boolean;
}[] = [
  {
    key: "title",
    label: "title",
    filled: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "description",
    label: "description of at least forty characters",
    filled: (v) => typeof v === "string" && v.trim().length >= 40,
  },
  {
    key: "publisher",
    label: "publisher",
    filled: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "license",
    label: "licence",
    filled: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "conformsTo",
    label: "standard it conforms to",
    filled: (v) =>
      Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.length > 0,
  },
  {
    key: "theme",
    label: "theme",
    filled: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "datasetType",
    label: "dataset type",
    filled: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "legalBasis",
    label: "legal basis",
    filled: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "recordCount",
    label: "record count",
    filled: (v) => typeof v === "number" && v > 0,
  },
];

/** The band below which a description counts as incomplete. */
export const COMPLETENESS_BAND = {
  low: 0.8,
  high: 1,
  text: "8 of 9 fields or more",
};

export interface Completeness {
  /** 0 to 1 */
  score: number;
  filled: number;
  total: number;
  missing: string[];
}

export function descriptionCompleteness(
  entry: CatalogEntryLike | null | undefined,
): Completeness {
  const total = DESCRIPTION_FIELDS.length;
  if (!entry)
    return {
      score: 0,
      filled: 0,
      total,
      missing: DESCRIPTION_FIELDS.map((f) => f.label),
    };
  const missing = DESCRIPTION_FIELDS.filter((f) => !f.filled(entry[f.key])).map(
    (f) => f.label,
  );
  const filled = total - missing.length;
  return {
    score: Math.round((filled / total) * 100) / 100,
    filled,
    total,
    missing,
  };
}

/** The fact line a dataset node carries. */
export function completenessFact(c: Completeness): [string, string] {
  return [
    "description (Art. 77)",
    `${c.filled} of ${c.total} fields${
      c.missing.length ? `, missing: ${c.missing.join(", ")}` : ""
    }`,
  ];
}
