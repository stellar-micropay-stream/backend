export interface StreamSession {
  sessionId: string;
  sender: string;
  receiver: string;
  ratePerSec: string;
  mode: "onchain" | "channel";
  startedAt: number;
  lastPaymentAt: number;
  status: "active" | "paused" | "closed";
}

const sessions = new Map<string, StreamSession>();

export function createSession(data: Omit<StreamSession, "startedAt" | "lastPaymentAt" | "status">): StreamSession {
  const now = Date.now();
  const session: StreamSession = { ...data, startedAt: now, lastPaymentAt: now, status: "active" };
  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId: string): StreamSession | undefined {
  return sessions.get(sessionId);
}

export function updateSession(sessionId: string, patch: Partial<StreamSession>): StreamSession | undefined {
  const s = sessions.get(sessionId);
  if (!s) return undefined;
  const updated = { ...s, ...patch };
  sessions.set(sessionId, updated);
  return updated;
}

export function closeSession(sessionId: string): boolean {
  const s = sessions.get(sessionId);
  if (!s) return false;
  sessions.set(sessionId, { ...s, status: "closed" });
  return true;
}

export function getActiveSessions(): StreamSession[] {
  return Array.from(sessions.values()).filter((s) => s.status === "active");
}

export function getAllSessions(): StreamSession[] {
  return Array.from(sessions.values());
}
