jest.mock("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn().mockResolvedValue({
        sequenceNumber: () => "12345",
        balances: [{ asset_type: "native", balance: "100.0000000" }],
      }),
      submitTransaction: jest.fn().mockResolvedValue({ hash: "abc123" }),
      payments: jest.fn().mockReturnValue({
        forAccount: jest.fn().mockReturnThis(),
        cursor: jest.fn().mockReturnThis(),
        stream: jest.fn().mockReturnValue(() => {}),
      }),
    })),
  },
}));

import { getAccountInfo, streamPayments } from "../../src/stellar/horizonClient";

describe("horizonClient", () => {
  it("getAccountInfo returns sequence and balances", async () => {
    const info = await getAccountInfo("GABC");
    expect(info.sequence).toBe("12345");
    expect(info.balances).toHaveLength(1);
  });

  it("streamPayments returns a close function", () => {
    const close = streamPayments("GABC", jest.fn());
    expect(typeof close).toBe("function");
  });
});
