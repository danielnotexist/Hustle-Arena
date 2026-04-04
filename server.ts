import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database Initialization
const db = new Database("hustle_arena.db");

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedValue: string) {
  if (!storedValue.includes(":")) {
    return password === storedValue;
  }

  const [salt, hash] = storedValue.split(":");
  if (!salt || !hash) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function getAuthPayload(body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  return { username, email, password };
}

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
    const { username, email, password } = getAuthPayload(req.body ?? {});

    if (!username || !email || password.length < 6) {
      res.status(400).json({
        success: false,
        message: "Username, valid email, and a password of at least 6 characters are required.",
      });
      return;
    }

    try {
      const stmt = db.prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
      const result = stmt.run(username, email, hashPassword(password));
      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = getAuthPayload(req.body ?? {});

    if (!email || !password) {
      res.status(400).json({ success: false, message: "Email and password are required." });
      return;
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user || !verifyPassword(password, user.password)) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    if (!user.password.includes(":")) {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(password), user.id);
    }

    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, kycStatus: user.kyc_status } });
  });

  // --- User Stats ---
  app.get("/api/user/stats", (req, res) => {
    res.json({
      credits: 0,
      level: 1,
      rank: "Bronze I",
      winRate: "0%",
      kdRatio: 0,
      headshotPct: "0%"
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
