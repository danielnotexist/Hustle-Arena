import type { RequestHandler } from "express";

type Hit = {
  count: number;
  resetAt: number;
};

const hits = new Map<string, Hit>();

export function rateLimit(options: { windowMs: number; max: number }): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;

    if (current.count > options.max) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}
