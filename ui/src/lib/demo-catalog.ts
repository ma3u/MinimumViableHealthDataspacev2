import { EDC_CONTEXT } from "@/lib/edc/client";

/** One participant's entry in public/mock/assets.json. */
export interface DemoAssetEntry {
  participantId?: string;
  identity?: string;
  assets?: Record<string, unknown>[];
}

/**
 * The DSP catalog a provider offers in the demonstrator, built from the
 * bundled demo assets (public/mock/assets.json).
 *
 * Two callers share it. `/api/negotiations?catalog=true` falls back to it on
 * the hub when the connector has no participant context for the id, and the
 * negotiate page builds it itself in the GitHub Pages build, where there is no
 * API route and the catalog request used to resolve to negotiations.json, an
 * array with no datasets, so every provider showed "No datasets with offers
 * found" (#876).
 *
 * Returns null when the provider has no entry or no assets.
 */
export function buildDemoCatalog(
  entries: DemoAssetEntry[],
  providerDid: string,
): Record<string, unknown> | null {
  const wanted = decodeURIComponent(providerDid).toLowerCase();
  const entry = entries.find(
    (e) =>
      decodeURIComponent(e.identity ?? "").toLowerCase() === wanted ||
      e.participantId === providerDid,
  );
  if (!entry || !(entry.assets ?? []).length) return null;

  const dataset = (entry.assets ?? []).map((asset) => {
    const props = (asset.properties ?? {}) as Record<string, unknown>;
    const assetId = (asset["@id"] ?? props.id ?? "") as string;
    return {
      "@id": assetId,
      "@type": "dcat:Dataset",
      name: props.name ?? assetId,
      description: props.description ?? "",
      contenttype: props.contenttype ?? "",
      hasPolicy: [
        {
          "@id": `demo-offer:${assetId}`,
          "@type": "odrl:Offer",
          assigner: entry.identity ?? providerDid,
          target: assetId,
          permission: [{ action: "use" }],
        },
      ],
    };
  });

  return {
    "@context": [EDC_CONTEXT],
    "@type": "dcat:Catalog",
    participantId: entry.identity ?? providerDid,
    dataset,
    demo: true,
  };
}
