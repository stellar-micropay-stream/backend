import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../src/index";

// Mock scheduler to avoid Redis dependency in tests
jest.mock("../../src/services/paymentScheduler", () => ({
  scheduleSession: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  getPaymentQueue: jest.fn(),
}));

const JWT_SECRET = "dev_secret";
const token = jwt.sign({ sub: "GABC123" }, JWT_SECRET);
const authHeader = `Bearer ${token}`;

describe("POST /sessions", () => {
  it("creates a session", async () => {
    const res = await request(app)
      .post("/sessions")
      .set("Authorization", authHeader)
      .send({ receiver: "GXYZ456", ratePerSec: "0.0000100", mode: "onchain" });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.status).toBe("active");
  });

  it("returns 400 when fields missing", async () => {
    const res = await request(app)
      .post("/sessions")
      .set("Authorization", authHeader)
      .send({ receiver: "GXYZ456" });

    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .post("/sessions")
      .send({ receiver: "GXYZ456", ratePerSec: "0.0000100", mode: "onchain" });

    expect(res.status).toBe(401);
  });
});

describe("GET /sessions/:id", () => {
  it("returns 404 for unknown session", async () => {
    const res = await request(app)
      .get("/sessions/no-such-id")
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);
  });
});
