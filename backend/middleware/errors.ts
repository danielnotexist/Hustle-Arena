import type { ErrorRequestHandler } from "express";
import { isProduction } from "../config";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";

  if (!isProduction) {
    console.error(error);
  }

  res.status(500).json({
    error: isProduction ? "Unexpected server error" : message,
  });
};
