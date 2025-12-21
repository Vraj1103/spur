import { Request, Response, NextFunction } from "express";
import { globalLogger } from "../utils/logger.js";

// Global error handler for unhandled errors
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  globalLogger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });
  res.status(500).json({ error: "Something went wrong!" });
};
