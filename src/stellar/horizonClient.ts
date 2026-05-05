import { Horizon } from "@stellar/stellar-sdk";

const HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";

export const horizonServer = new Horizon.Server(HORIZON_URL);

export async function getAccountInfo(publicKey: string) {
  const account = await horizonServer.loadAccount(publicKey);
  return {
    sequence: account.sequenceNumber(),
    balances: account.balances,
  };
}

export async function submitTx(xdr: string): Promise<string> {
  const { TransactionBuilder } = await import("@stellar/stellar-sdk");
  const tx = TransactionBuilder.fromXDR(xdr, process.env.STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet");
  const result = await horizonServer.submitTransaction(tx);
  return result.hash;
}

export function streamPayments(
  accountId: string,
  onPayment: (payment: Horizon.ServerApi.PaymentOperationRecord) => void
): () => void {
  const close = horizonServer
    .payments()
    .forAccount(accountId)
    .cursor("now")
    .stream({ onmessage: onPayment as any });
  return close;
}
