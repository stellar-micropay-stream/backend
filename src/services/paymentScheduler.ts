import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PAYMENT_INTERVAL_MS = parseInt(process.env.PAYMENT_INTERVAL_MS || "2000");

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port || "6379") };
}

let paymentQueue: Queue | null = null;

export function getPaymentQueue(): Queue {
  if (!paymentQueue) {
    paymentQueue = new Queue("payments", {
      connection: { ...parseRedisUrl(REDIS_URL), maxRetriesPerRequest: null },
    });
  }
  return paymentQueue;
}

export async function scheduleSession(sessionId: string): Promise<void> {
  const queue = getPaymentQueue();
  await queue.add(
    "tick",
    { sessionId },
    {
      repeat: { every: PAYMENT_INTERVAL_MS },
      jobId: `session-${sessionId}`,
    }
  );
}

export async function cancelSession(sessionId: string): Promise<void> {
  const queue = getPaymentQueue();
  await queue.removeRepeatable("tick", { every: PAYMENT_INTERVAL_MS }, `session-${sessionId}`);
}
