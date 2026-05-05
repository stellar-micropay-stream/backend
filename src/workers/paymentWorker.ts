import { Worker, Job } from "bullmq";
import { EventEmitter } from "events";
import * as streamManager from "../services/streamManager";

export const paymentEvents = new EventEmitter();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port || "6379") };
}

export function startPaymentWorker(): Worker {
  const worker = new Worker(
    "payments",
    async (job: Job) => {
      const { sessionId } = job.data;
      if (!sessionId) return;

      const session = streamManager.getSession(sessionId);
      if (!session || session.status !== "active") return;

      const now = Date.now();
      const elapsed = (now - session.lastPaymentAt) / 1000;
      const amount = (parseFloat(session.ratePerSec) * elapsed).toFixed(7);

      streamManager.updateSession(sessionId, { lastPaymentAt: now });

      const event = {
        type: "payment",
        sessionId,
        sender: session.sender,
        receiver: session.receiver,
        amount,
        timestamp: Math.floor(now / 1000),
      };

      paymentEvents.emit(session.sender, event);
      paymentEvents.emit(session.receiver, event);
    },
    { connection: { ...parseRedisUrl(REDIS_URL), maxRetriesPerRequest: null } }
  );

  worker.on("failed", (job, err) => {
    console.error(`Payment job ${job?.id} failed:`, err.message);
  });

  return worker;
}
