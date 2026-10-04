import { type Request, type Response, type NextFunction } from "express";
import { app } from "./app.js";
import { logger } from "./logger.js";

// ---- Error handler ---------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "unhandled route error");
  res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
});
