import { type Request, type Response, type NextFunction } from "express";
import { app } from "./app.js";
import { logger } from "./logger.js";

// ---- Error handler ---------------------------------------------------------

// The caller gets `{ error }` and nothing else. A Neo4j or driver error quotes
// the query it failed on, so its message goes to the log (reduced to its
// first line by logger.ts) and never into the response (#1029).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "unhandled route error");
  res.status(500).json({ error: "Internal Server Error" });
});
