import express from "express";
import sessionsRouter from "./api/routes/sessions";
import paymentsRouter from "./api/routes/payments";
import channelsRouter from "./api/routes/channels";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/sessions", sessionsRouter);
app.use("/payments", paymentsRouter);
app.use("/channels", channelsRouter);

const PORT = parseInt(process.env.PORT || "3001");

if (require.main === module) {
  const { startPaymentWorker } = require("./workers/paymentWorker");
  startPaymentWorker();
  app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
}

export default app;
