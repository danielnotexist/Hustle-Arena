import type { NextFunction, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase";

export type AuthenticatedRequest = Request & {
  auth?: {
    user: User;
    profile: {
      id: string;
      username: string | null;
      email: string | null;
      role: "user" | "moderator" | "admin";
    } | null;
  };
};

function getBearerToken(req: Request) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, email, role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    next(profileError);
    return;
  }

  req.auth = {
    user: data.user,
    profile: profile as AuthenticatedRequest["auth"]["profile"],
  };

  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.auth?.profile?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}
