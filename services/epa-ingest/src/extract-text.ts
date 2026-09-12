/**
 * Text extraction — the only step that can invent a character.
 *
 * Three inputs, three provenance outcomes:
 *
 * | Input                    | Extractor        | Provenance          |
 * | ------------------------ | ---------------- | ------------------- |
 * | PDF carrying a text layer | `pdf-text-layer` | `lab-issued-digital` |
 * | PNG / JPEG / TIFF         | `tesseract`      | `ocr-transcribed`    |
 * | `.txt`                    | `plain-text`     | caller's assertion, default `self-tracked` |
 *
 * A scanned PDF has no text layer; rasterising one needs a native toolchain we
 * deliberately do not depend on, so that case is refused with instructions
 * rather than silently returning an empty parse.
 *
 * `pdfjs-dist` and `tesseract.js` are optional dependencies, imported through a
 * non-literal specifier so this package type-checks and unit-tests with nothing
 * installed. The parser and the FHIR writer have no runtime dependencies at all.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { ExtractedText, SourceKind } from "./types.js";

/** Text recovered from a PDF page. */
interface PdfTextItem {
  str?: string;
}
interface PdfTextContent {
  items: PdfTextItem[];
}
interface PdfPage {
  getTextContent(): Promise<PdfTextContent>;
}
interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}
interface PdfjsModule {
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDocument> };
}

interface TesseractResult {
  data: { text: string; confidence: number };
}
interface TesseractWorker {
  recognize(input: Buffer): Promise<TesseractResult>;
  terminate(): Promise<void>;
}
interface TesseractModule {
  createWorker(langs: string): Promise<TesseractWorker>;
}

export class MissingOptionalDependency extends Error {
  constructor(pkg: string, why: string) {
    super(
      `${why}\n\nThis needs the optional dependency "${pkg}".\n` +
        `Install it in services/epa-ingest:  npm install ${pkg}`,
    );
    this.name = "MissingOptionalDependency";
  }
}

async function loadOptional<T>(
  specifier: string,
  pkg: string,
  why: string,
): Promise<T> {
  try {
    // Non-literal specifier: TypeScript does not try to resolve an optional
    // dependency that may legitimately be absent.
    const dynamicSpecifier = specifier;
    return (await import(dynamicSpecifier)) as T;
  } catch {
    throw new MissingOptionalDependency(pkg, why);
  }
}

/** Joins a PDF's text items into lines, preserving the column layout roughly. */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadOptional<PdfjsModule>(
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist",
    "Reading a PDF's text layer",
  );
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str ?? "").join(" "));
  }
  return pages.join("\n");
}

async function extractOcrText(
  buffer: Buffer,
): Promise<{ text: string; confidence: number }> {
  const tesseract = await loadOptional<TesseractModule>(
    "tesseract.js",
    "tesseract.js",
    "Recognising text in a scanned image",
  );
  const worker = await tesseract.createWorker("deu+eng");
  try {
    const { data } = await worker.recognize(buffer);
    return { text: data.text, confidence: data.confidence / 100 };
  } finally {
    await worker.terminate();
  }
}

/** A PDF with almost no extractable characters is a scan, not a digital report. */
export function looksLikeScannedPdf(text: string): boolean {
  return text.replace(/\s/g, "").length < 50;
}

export interface ExtractOptions {
  /** Provenance to assert for plain-text input. Ignored for PDF and images. */
  plainTextSourceKind?: SourceKind;
}

export async function extractText(
  path: string,
  options: ExtractOptions = {},
): Promise<ExtractedText> {
  const ext = extname(path).toLowerCase();
  const sourceDocument = path.split("/").pop() ?? path;

  if (ext === ".txt" || ext === ".text") {
    const text = await readFile(path, "utf8");
    return {
      text,
      source: {
        // Least-trust default: text handed to us with no document behind it is
        // the citizen's own assertion until they say otherwise.
        kind: options.plainTextSourceKind ?? "self-tracked",
        sourceDocument,
        extractor: "plain-text",
      },
    };
  }

  if (ext === ".pdf") {
    const bytes = new Uint8Array(await readFile(path));
    const text = await extractPdfText(bytes);
    if (looksLikeScannedPdf(text)) {
      throw new Error(
        `"${sourceDocument}" has no usable text layer — it is a scan.\n` +
          `Convert its pages to images first, then run this on them, e.g.:\n` +
          `  pdftoppm -r 300 -png "${path}" page\n` +
          `  epa-ingest page-1.png`,
      );
    }
    return {
      text,
      source: {
        kind: "lab-issued-digital",
        sourceDocument,
        extractor: "pdf-text-layer",
      },
    };
  }

  if ([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"].includes(ext)) {
    const buffer = await readFile(path);
    const { text, confidence } = await extractOcrText(buffer);
    return {
      text,
      source: {
        kind: "ocr-transcribed",
        sourceDocument,
        extractor: "tesseract",
        ocrConfidence: confidence,
      },
    };
  }

  throw new Error(
    `Unsupported input "${
      ext || path
    }". Accepts: .pdf, .png, .jpg, .jpeg, .tif, .tiff, .webp, .txt`,
  );
}
