import { Request, Response, NextFunction } from "express";
import { globalLogger } from "../utils/logger.js";

// Global error handler for unhandled errors
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  globalLogger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    type: err.name,
  });

  if (res.headersSent) {
    return next(err);
  }

  // Handle JSON parse errors (SyntaxError)
  if (
    err instanceof SyntaxError &&
    "status" in err &&
    err.status === 400 &&
    "body" in err
  ) {
    return res.status(400).json({
      error: "Bad Request",
      details: "Invalid JSON format in request body.",
    });
  }

  res.status(500).json({
    error: "Internal Server Error",
    details: "An unexpected error occurred on the server.",
  });
};
