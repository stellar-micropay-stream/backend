import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import * as streamManager from "../../services/streamManager";
import * as scheduler from "../../services/paymentScheduler";

const router = Router();

router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  const { receiver, ratePerSec, mode } = req.body;
  if (!receiver || !ratePerSec || !mode) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const sessionId = uuidv4();
  const session = streamManager.createSession({
    sessionId,
    sender: req.walletAddress!,
    receiver,
    ratePerSec,
    mode,
  });

  await scheduler.scheduleSession(sessionId);
  res.json(session);
});

router.get("/:id", authMiddleware, (req: AuthRequest, res) => {
  const session = streamManager.getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res) => {
  const closed = streamManager.closeSession(req.params.id);
  if (!closed) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await scheduler.cancelSession(req.params.id);
  res.json({ success: true });
});

export default router;
