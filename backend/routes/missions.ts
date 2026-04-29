import { Router } from "express";

const missions = [
  { id: 1, title: "Data Heist", reward: 500, difficulty: "Hard", time_left: "2h left" },
  { id: 2, title: "Nexus Defense", reward: 200, difficulty: "Easy", time_left: "5h left" },
  { id: 3, title: "Silent Assassin", reward: 1200, difficulty: "Extreme", time_left: "12h left" },
];

export const missionsRouter = Router();

missionsRouter.get("/", (_req, res) => {
  res.json(missions);
});

missionsRouter.post("/accept", (req, res) => {
  res.json({ success: true, message: `Mission ${req.body?.missionId} accepted!` });
});
