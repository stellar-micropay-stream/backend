import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import * as channelService from "../../services/channelService";

const router = Router();

router.post("/open", authMiddleware, (req: AuthRequest, res) => {
  const { receiver, depositAmount, contractId } = req.body;
  if (!receiver || !depositAmount || !contractId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const channel = channelService.openChannel({
    contractId,
    sender: req.walletAddress!,
    receiver,
    depositAmount,
  });
  res.json(channel);
});

router.post("/update", authMiddleware, (req: AuthRequest, res) => {
  const { channelId, amount, senderSig } = req.body;
  if (!channelId || !amount || !senderSig) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const updated = channelService.updateChannel(channelId, amount, senderSig);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/close", authMiddleware, (req: AuthRequest, res) => {
  const { channelId } = req.body;
  if (!channelId) {
    res.status(400).json({ error: "Missing channelId" });
    return;
  }

  try {
    const closed = channelService.closeChannel(channelId);
    res.json(closed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id", authMiddleware, (req: AuthRequest, res) => {
  const channel = channelService.getChannel(req.params.id);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  res.json(channel);
});

export default router;
