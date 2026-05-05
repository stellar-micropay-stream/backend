import {
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { horizonServer } from "./horizonClient";

const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

export async function buildPaymentTx(
  senderSecret: string,
  receiver: string,
  amount: string,
  memo?: string
): Promise<string> {
  const senderKeypair = Keypair.fromSecret(senderSecret);
  const senderAccount = await horizonServer.loadAccount(senderKeypair.publicKey());

  const tx = new TransactionBuilder(senderAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: receiver,
        asset: Asset.native(),
        amount,
      })
    )
    .setTimeout(30);

  if (memo) tx.addMemo({ type: "text", value: memo } as any);

  const built = tx.build();
  built.sign(senderKeypair);
  return built.toXDR();
}
