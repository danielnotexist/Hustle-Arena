import express from "express";
import { backendConfig, getMissingSupabaseEnv } from "./config";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/errors";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "./middleware/auth";
import { rateLimit } from "./middleware/rate-limit";
import { missionsRouter } from "./routes/missions";
import { vaultRouter } from "./routes/vault";
import { walletRouter } from "./routes/wallet";

const app = express();

app.set("trust proxy", 1);
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60_000, max: 240 }));

app.get("/health", (_req, res) => {
  const missingSupabaseEnv = getMissingSupabaseEnv();

  res.json({
    ok: true,
    service: "hustle-arena-backend",
    environment: backendConfig.nodeEnv,
    supabaseConfigured: missingSupabaseEnv.length === 0,
    missingSupabaseEnv,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/me", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    user: {
      id: req.auth?.user.id,
      email: req.auth?.user.email,
    },
    profile: req.auth?.profile,
  });
});

app.get("/api/admin/health", requireAuth, requireAdmin, (_req, res) => {
  res.json({ ok: true, scope: "admin" });
});

app.use("/api/missions", missionsRouter);
app.use("/api/vault", vaultRouter);
app.use("/api/wallet", walletRouter);

app.use(errorHandler);

app.listen(backendConfig.port, "0.0.0.0", () => {
  console.log(`Hustle Arena backend listening on port ${backendConfig.port}`);
});
