import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database Initialization
const db = new Database("hustle_arena.db");

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    kyc_status TEXT DEFAULT 'none',
    joined_date TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    reward INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    time_left TEXT NOT NULL
  );

  -- Seed Missions if empty
  INSERT OR IGNORE INTO missions (id, title, reward, difficulty, time_left) VALUES 
  (1, 'Data Heist', 500, 'Hard', '2h left'),
  (2, 'Nexus Defense', 200, 'Easy', '5h left'),
  (3, 'Silent Assassin', 1200, 'Extreme', '12h left');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Auth Endpoints ---
  app.post("/api/auth/register", (req, res) => {
    const { username, email, password } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
      const result = stmt.run(username, email, password);
      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    if (user) {
      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, kycStatus: user.kyc_status } });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });

  // --- User Stats ---
  app.get("/api/user/stats", (req, res) => {
    res.json({
      credits: 2450,
      level: 42,
      rank: "Diamond III",
      winRate: "64.5%",
      kdRatio: 1.42,
      headshotPct: "52.1%"
    });
  });

  // --- Admin Endpoints ---
  app.get("/api/admin/users", (req, res) => {
    const users = db.prepare("SELECT id, username, email, role, kyc_status as kycStatus, joined_date as joinedDate FROM users").all();
    res.json(users);
  });

  app.post("/api/admin/kyc/approve", (req, res) => {
    const { userId } = req.body;
    try {
      db.prepare("UPDATE users SET kyc_status = 'verified' WHERE id = ?").run(userId);
      res.json({ success: true, message: "KYC Approved" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/admin/kyc/reject", (req, res) => {
    const { userId } = req.body;
    try {
      db.prepare("UPDATE users SET kyc_status = 'rejected' WHERE id = ?").run(userId);
      res.json({ success: true, message: "KYC Rejected" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // --- Missions ---
  app.get("/api/missions", (req, res) => {
    const missions = db.prepare("SELECT * FROM missions").all();
    res.json(missions);
  });

  app.post("/api/missions/accept", (req, res) => {
    const { missionId } = req.body;
    res.json({ success: true, message: `Mission ${missionId} accepted!` });
  });

  app.post("/api/vault/purchase", (req, res) => {
    const { itemId } = req.body;
    res.json({ success: true, message: `Item ${itemId} purchased!` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
