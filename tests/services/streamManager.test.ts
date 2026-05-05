import {
  createSession,
  getSession,
  updateSession,
  closeSession,
  getActiveSessions,
} from "../../src/services/streamManager";

describe("streamManager", () => {
  const base = {
    sessionId: "test-session-1",
    sender: "GABC",
    receiver: "GXYZ",
    ratePerSec: "0.0000100",
    mode: "onchain" as const,
  };

  it("creates a session with active status", () => {
    const s = createSession(base);
    expect(s.sessionId).toBe("test-session-1");
    expect(s.status).toBe("active");
    expect(s.startedAt).toBeGreaterThan(0);
  });

  it("retrieves a session by id", () => {
    const s = getSession("test-session-1");
    expect(s).toBeDefined();
    expect(s?.sender).toBe("GABC");
  });

  it("updates session fields", () => {
    const now = Date.now();
    const s = updateSession("test-session-1", { lastPaymentAt: now });
    expect(s?.lastPaymentAt).toBe(now);
  });

  it("closes a session", () => {
    const ok = closeSession("test-session-1");
    expect(ok).toBe(true);
    expect(getSession("test-session-1")?.status).toBe("closed");
  });

  it("returns false when closing non-existent session", () => {
    expect(closeSession("no-such-id")).toBe(false);
  });

  it("getActiveSessions excludes closed sessions", () => {
    createSession({ ...base, sessionId: "active-1" });
    const active = getActiveSessions();
    expect(active.some((s) => s.sessionId === "active-1")).toBe(true);
    expect(active.some((s) => s.sessionId === "test-session-1")).toBe(false);
  });
});
