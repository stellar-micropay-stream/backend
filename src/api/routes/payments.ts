import { Router, Request, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// SSE: real-time payment events for a wallet
router.get("/stream", (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Keep alive ping every 15s
  const ping = setInterval(() => res.write(": ping\n\n"), 15_000);

  // Attach to global event emitter (populated by paymentWorker)
  const { paymentEvents } = require("../../workers/paymentWorker");
  const handler = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  paymentEvents.on(wallet, handler);

  req.on("close", () => {
    clearInterval(ping);
    paymentEvents.off(wallet, handler);
  });
});

router.post("/send", authMiddleware, async (req: AuthRequest, res) => {
  const { receiver, amount } = req.body;
  if (!receiver || !amount) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Direct one-off payment — enqueue immediately
  const { getPaymentQueue } = require("../../services/paymentScheduler");
  await getPaymentQueue().add("send", {
    sender: req.walletAddress,
    receiver,
    amount,
    sessionId: null,
  });
  res.json({ queued: true });
});

export default router;
