import { type Request, type Response, type NextFunction } from "express";
import { getSession } from "../db.js";
import { app } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";

// ---- Catalog Endpoints (HealthDCAT-AP JSON-LD) ----------------------------

/**
 * GET /catalog/datasets
 * Returns all HealthDCAT-AP dataset entries as JSON-LD.
 */
app.get(
  "/catalog/datasets",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const result = await session.run(`
      MATCH (ds:HealthDataset)
      OPTIONAL MATCH (ds)-[:HAS_DISTRIBUTION]->(dist:Distribution)
      OPTIONAL MATCH (ds)-[:PUBLISHED_BY]->(pub:Organization)
      OPTIONAL MATCH (ds)-[:HAS_CONTACT_POINT]->(cp:ContactPoint)
      RETURN ds, collect(DISTINCT dist) AS distributions,
             pub, cp
    `);

      const datasets = result.records.map((r) => {
        const ds = r.get("ds").properties;
        const dists = r.get("distributions").map((d: any) => d.properties);
        const pub = r.get("pub")?.properties;
        const cp = r.get("cp")?.properties;

        return {
          "@type": "dcat:Dataset",
          "dct:identifier": ds.dctIdentifier ?? ds.datasetId,
          "dct:title": ds.title,
          "dct:description": ds.description,
          "dct:issued": ds.issued,
          "dct:modified": ds.modified,
          "dct:language": ds.language,
          "dct:spatial": ds.dctSpatial,
          "dct:temporal":
            ds.dctTemporalStart && ds.dctTemporalEnd
              ? { startDate: ds.dctTemporalStart, endDate: ds.dctTemporalEnd }
              : undefined,
          "dcat:theme": ds.themes,
          "healthdcatap:healthCategory": ds.hdcatapHealthCategory,
          "healthdcatap:healthTheme": ds.hdcatapHealthTheme,
          "healthdcatap:datasetType": ds.hdcatapDatasetType,
          "healthdcatap:personalData": ds.hdcatapPersonalData,
          "healthdcatap:sensitiveData": ds.hdcatapSensitiveData,
          "healthdcatap:numberOfRecords": ds.hdcatapNumberOfRecords,
          "healthdcatap:numberOfUniqueIndividuals":
            ds.hdcatapNumberOfUniqueIndividuals,
          "healthdcatap:minTypicalAge": ds.hdcatapMinTypicalAge,
          "healthdcatap:maxTypicalAge": ds.hdcatapMaxTypicalAge,
          "healthdcatap:legalBasisForAccess": ds.hdcatapLegalBasisForAccess,
          "healthdcatap:purpose": ds.hdcatapPurpose,
          ...(pub
            ? {
                "dct:publisher": {
                  "@type": "foaf:Organization",
                  "foaf:name": pub.name,
                },
              }
            : {}),
          ...(cp
            ? {
                "dcat:contactPoint": {
                  "@type": "vcard:Organization",
                  "vcard:fn": cp.name,
                  "vcard:hasEmail": cp.email,
                },
              }
            : {}),
          "dcat:distribution": dists.map((d: any) => ({
            "@type": "dcat:Distribution",
            "dcat:accessURL": d.accessURL,
            "dcat:downloadURL": d.downloadURL,
            "dcat:mediaType": d.mediaType,
            "dct:format": d.format,
            "dct:title": d.title,
          })),
        };
      });

      const catalog = {
        "@context": {
          dcat: "http://www.w3.org/ns/dcat#",
          dct: "http://purl.org/dc/terms/",
          foaf: "http://xmlns.com/foaf/0.1/",
          vcard: "http://www.w3.org/2006/vcard/ns#",
          healthdcatap: "http://healthdcat-ap.eu/ns#",
        },
        "@type": "dcat:Catalog",
        "dct:title": "Health Dataspace v2 — HealthDCAT-AP Catalog",
        "dct:description":
          "EHDS-compliant health dataset catalog served via Neo4j Query Proxy",
        "dcat:dataset": datasets,
      };

      res.setHeader("Content-Type", "application/ld+json");
      res.json(catalog);
      logTransferEvent(
        "/catalog/datasets",
        "GET",
        req.headers["x-participant"] as string,
        200,
        datasets.length,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /catalog/datasets/:id
 * Returns a single HealthDCAT-AP dataset entry as JSON-LD.
 */
app.get(
  "/catalog/datasets/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const datasetId = req.params.id;

      const result = await session.run(
        `
      MATCH (ds:HealthDataset)
      WHERE ds.dctIdentifier = $datasetId OR ds.datasetId = $datasetId
      OPTIONAL MATCH (ds)-[:HAS_DISTRIBUTION]->(dist:Distribution)
      OPTIONAL MATCH (ds)-[:PUBLISHED_BY]->(pub:Organization)
      OPTIONAL MATCH (ds)-[:HAS_CONTACT_POINT]->(cp:ContactPoint)
      RETURN ds, collect(DISTINCT dist) AS distributions, pub, cp
      `,
        { datasetId },
      );

      if (result.records.length === 0) {
        res.status(404).json({ error: `Dataset ${datasetId} not found` });
        return;
      }

      const r = result.records[0];
      const ds = r.get("ds").properties;
      const dists = r.get("distributions").map((d: any) => d.properties);
      const pub = r.get("pub")?.properties;
      const cp = r.get("cp")?.properties;

      const dataset = {
        "@context": {
          dcat: "http://www.w3.org/ns/dcat#",
          dct: "http://purl.org/dc/terms/",
          foaf: "http://xmlns.com/foaf/0.1/",
          vcard: "http://www.w3.org/2006/vcard/ns#",
          healthdcatap: "http://healthdcat-ap.eu/ns#",
        },
        "@type": "dcat:Dataset",
        "dct:identifier": ds.dctIdentifier ?? ds.datasetId,
        "dct:title": ds.title,
        "dct:description": ds.description,
        "dct:issued": ds.issued,
        "dct:modified": ds.modified,
        "dct:language": ds.language,
        "dct:spatial": ds.dctSpatial,
        "dct:temporal":
          ds.dctTemporalStart && ds.dctTemporalEnd
            ? { startDate: ds.dctTemporalStart, endDate: ds.dctTemporalEnd }
            : undefined,
        "dcat:theme": ds.themes,
        "healthdcatap:healthCategory": ds.hdcatapHealthCategory,
        "healthdcatap:healthTheme": ds.hdcatapHealthTheme,
        "healthdcatap:datasetType": ds.hdcatapDatasetType,
        "healthdcatap:personalData": ds.hdcatapPersonalData,
        "healthdcatap:sensitiveData": ds.hdcatapSensitiveData,
        "healthdcatap:numberOfRecords": ds.hdcatapNumberOfRecords,
        "healthdcatap:numberOfUniqueIndividuals":
          ds.hdcatapNumberOfUniqueIndividuals,
        "healthdcatap:minTypicalAge": ds.hdcatapMinTypicalAge,
        "healthdcatap:maxTypicalAge": ds.hdcatapMaxTypicalAge,
        "healthdcatap:legalBasisForAccess": ds.hdcatapLegalBasisForAccess,
        "healthdcatap:purpose": ds.hdcatapPurpose,
        ...(pub
          ? {
              "dct:publisher": {
                "@type": "foaf:Organization",
                "foaf:name": pub.name,
              },
            }
          : {}),
        ...(cp
          ? {
              "dcat:contactPoint": {
                "@type": "vcard:Organization",
                "vcard:fn": cp.name,
                "vcard:hasEmail": cp.email,
              },
            }
          : {}),
        "dcat:distribution": dists.map((d: any) => ({
          "@type": "dcat:Distribution",
          "dcat:accessURL": d.accessURL,
          "dcat:downloadURL": d.downloadURL,
          "dcat:mediaType": d.mediaType,
          "dct:format": d.format,
          "dct:title": d.title,
        })),
      };

      res.setHeader("Content-Type", "application/ld+json");
      res.json(dataset);
      logTransferEvent(
        `/catalog/datasets/${datasetId}`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        1,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
