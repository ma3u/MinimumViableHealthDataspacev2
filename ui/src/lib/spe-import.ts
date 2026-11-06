import {
  LABEL_LAYER,
  LAYER_COLORS,
  NODE_ROLE_COLORS,
} from "@/lib/graph-constants";

/**
 * A transfer's data imported into an SPE workspace (#876). The neo4j-proxy
 * writes it (services/neo4j-proxy/src/spe-import.ts); these are the shapes
 * the hub's routes and pages share.
 */

export const IMPORT_SPES = [
  { id: "SPE-1", holder: "AlphaKlinik Berlin" },
  { id: "SPE-2", holder: "Limburg Medical Centre" },
] as const;

/** Where a transfer goes unless the user picks another workspace. */
export const DEFAULT_IMPORT_SPE = "SPE-1";

/**
 * The SPE id from the allowlist itself, never the caller's string, so a URL
 * built from it carries only a constant (CodeQL js/request-forgery).
 */
export function importSpeId(requested: string): string | null {
  return IMPORT_SPES.find((s) => s.id === requested)?.id ?? null;
}

export interface SpeImportResult {
  datasetId: string;
  speId: string;
  records: number;
  relationships: number;
  byType: Record<string, number>;
  importedAt: string;
  pseudonymised: boolean;
  /**
   * The workspace keeps it in memory until it stops (Azure, ADR-072); it is
   * not loaded through the Trustee as a sealed extract yet (#915).
   */
  untilStopped: boolean;
  /** The 3D overview of the import (/overview?import=…). */
  graphUrl: string;
}

/** The 3D overview of one import: its nodes and relations only. */
export function importViewUrl(datasetId: string, speId: string): string {
  return `/overview?import=${encodeURIComponent(
    datasetId,
  )}&spe=${encodeURIComponent(speId)}`;
}

/** A transfer the SPEs hold already, as GET /api/spe-imports reports it. */
export interface ExistingImport {
  datasetId: string;
  speId: string;
  records: number;
  importedAt: string;
}

interface ProxyNode {
  id: string;
  label: string;
  name: string;
  resourceType?: string;
  properties?: Record<string, string | number | boolean>;
}

/** The proxy's nodes as the graph viewer draws them: a layer and a colour. */
export function toGraphNodes(nodes: ProxyNode[]) {
  return nodes.map((n) => {
    const layer = LABEL_LAYER[n.label] ?? 0;
    return {
      id: n.id,
      name: n.name,
      label: n.label,
      layer,
      color: NODE_ROLE_COLORS[n.label] ?? LAYER_COLORS[layer] ?? "#888",
      group: n.resourceType,
      properties: n.properties ?? {},
    };
  });
}
