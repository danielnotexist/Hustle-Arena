import type { ErrorRequestHandler } from "express";
import { isProduction } from "../config";

type HttpError = Error & {
  statusCode?: number;
  status?: number;
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = Number((error as HttpError)?.statusCode || (error as HttpError)?.status || 500);
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";

  if (!isProduction) {
    console.error(error);
  }

  res.status(safeStatusCode).json({
    error: isProduction && safeStatusCode >= 500 ? "Unexpected server error" : message,
  });
};
