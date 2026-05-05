import { v4 as uuidv4 } from "uuid";

export interface ChannelState {
  channelId: string;
  contractId: string;
  sender: string;
  receiver: string;
  depositAmount: string;
  senderBalance: string;
  receiverBalance: string;
  sequenceNumber: number;
  senderSig: string;
  receiverSig: string;
  status: "open" | "closed";
}

const channels = new Map<string, ChannelState>();

export function openChannel(data: {
  contractId: string;
  sender: string;
  receiver: string;
  depositAmount: string;
}): ChannelState {
  const channel: ChannelState = {
    channelId: uuidv4(),
    ...data,
    senderBalance: data.depositAmount,
    receiverBalance: "0",
    sequenceNumber: 0,
    senderSig: "",
    receiverSig: "",
    status: "open",
  };
  channels.set(channel.channelId, channel);
  return channel;
}

export function updateChannel(
  channelId: string,
  amount: string,
  senderSig: string
): ChannelState {
  const ch = channels.get(channelId);
  if (!ch) throw new Error("Channel not found");
  if (ch.status === "closed") throw new Error("Channel already closed");

  const senderBal = parseFloat(ch.senderBalance) - parseFloat(amount);
  const receiverBal = parseFloat(ch.receiverBalance) + parseFloat(amount);
  if (senderBal < 0) throw new Error("Insufficient sender balance");

  const updated: ChannelState = {
    ...ch,
    senderBalance: senderBal.toFixed(7),
    receiverBalance: receiverBal.toFixed(7),
    sequenceNumber: ch.sequenceNumber + 1,
    senderSig,
    receiverSig: "",
  };
  channels.set(channelId, updated);
  return updated;
}

export function closeChannel(channelId: string): ChannelState {
  const ch = channels.get(channelId);
  if (!ch) throw new Error("Channel not found");
  if (ch.status === "closed") throw new Error("Channel already closed");
  const closed = { ...ch, status: "closed" as const };
  channels.set(channelId, closed);
  return closed;
}

export function getChannel(channelId: string): ChannelState | undefined {
  return channels.get(channelId);
}
