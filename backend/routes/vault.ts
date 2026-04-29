import { Router } from "express";

export const vaultRouter = Router();

vaultRouter.post("/purchase", (req, res) => {
  res.json({ success: true, message: `Item ${req.body?.itemId} purchased!` });
});
