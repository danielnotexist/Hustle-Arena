import type { RequestHandler } from "express";
import { backendConfig, isProduction } from "../config";

const allowedOrigins = new Set(
  backendConfig.frontendOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = origin && allowedOrigins.has(origin);

  if (isAllowedOrigin || (!isProduction && origin?.startsWith("http://localhost:"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
};
