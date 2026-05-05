import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

const counts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function rateLimit(req: AuthRequest, res: Response, next: NextFunction): void {
  const key = req.walletAddress || req.ip || "unknown";
  const now = Date.now();
  const entry = counts.get(key);

  if (!entry || now > entry.resetAt) {
    counts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= MAX_REQUESTS) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  entry.count++;
  next();
}
