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

export function isImportSpe(id: string): boolean {
  return IMPORT_SPES.some((s) => s.id === id);
}

export interface SpeImportResult {
  datasetId: string;
  speId: string;
  records: number;
  relationships: number;
  byType: Record<string, number>;
  importedAt: string;
  pseudonymised: boolean;
  /** The graph viewer, focused on the imported dataset. */
  graphUrl: string;
}

export function importGraphUrl(datasetId: string, speId: string): string {
  return `/graph?dataset=${encodeURIComponent(
    datasetId,
  )}&spe=${encodeURIComponent(speId)}`;
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
