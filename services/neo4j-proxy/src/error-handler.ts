import { type Request, type Response, type NextFunction } from "express";
import { app } from "./app.js";

// ---- Error handler ---------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[neo4j-proxy] Error:", err.message);
  res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
});
