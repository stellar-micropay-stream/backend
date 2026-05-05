# AI.md — stellar-micropay-stream

> **Org:** stellar-micropay-stream  
> **Repos:** `contract` · `backend` · `frontend`  
> **Last updated:** 2026-05-05

---

## Project Overview

**stellar-micropay-stream** is a real-time micropayment streaming platform built on the Stellar network. It enables continuous, per-second or per-event payments between parties using Soroban smart contracts for on-chain enforcement and an off-chain channel layer for high-throughput streaming.

The system is split across three repositories:

| Repo | Purpose | % of Project |
|------|---------|-------------|
| `contract` | Soroban smart contracts (escrow + streaming) | 40% ✅ |
| `backend` | Streaming orchestrator, payment scheduler, Stellar integration | 20% |
| `frontend` | React/Next.js UI, wallet connection, real-time dashboard | 20% |

---

## 1. Contract Repo — `stellar-micropay-stream/contract`

### 1.1 Purpose

On-chain enforcement layer. Two Soroban contracts handle all trustless logic:
- **escrow_contract** — locks funds, enforces time-locks, releases or refunds
- **streaming_contract** — rate-based continuous payment with per-tick settlement

### 3.2 Tech Stack

| Layer | Choice |
|-------|--------|
| Language | Rust (no_std) |
| SDK | `soroban-sdk` v22.0.11 |
| Build target | `wasm32-unknown-unknown` |
| Test framework | soroban-sdk `testutils` (in-process) |

### 3.3 Directory Structure

```
contracts/
├── escrow_contract/
│   ├── Cargo.toml
│   └── src/lib.rs        # deposit, release, refund + 4 tests
└── streaming_contract/
    ├── Cargo.toml
    └── src/lib.rs        # open_stream, tick, close_stream + 5 tests
Cargo.toml                # workspace root
```

### 1.4 escrow_contract

**Storage:** one `EscrowState` per `escrow_id` (Symbol key) in persistent storage.

```rust
pub struct EscrowState {
    pub sender: Address,
    pub receiver: Address,
    pub token: Address,
    pub amount: i128,
    pub unlock_time: u64,  // Unix timestamp; 0 = no lock
    pub released: bool,
}
```

**Functions:**

| Function | Auth | Description |
|----------|------|-------------|
| `deposit(escrow_id, sender, receiver, token, amount, unlock_time)` | sender | Pulls tokens into contract, creates escrow record |
| `release(escrow_id, caller)` | caller | Receiver claims anytime; sender claims only after `unlock_time` |
| `refund(escrow_id)` | sender | Sender reclaims after `unlock_time` expires |
| `get_escrow(escrow_id)` | — | View current state |

**Time-lock rules:**
- `unlock_time = 0` → no lock; receiver can release, sender cannot refund
- `unlock_time > 0` → sender can refund only when `ledger.timestamp >= unlock_time`

**Tests (4):**
- `test_deposit_and_release_by_receiver` — happy path release
- `test_refund_after_timelock` — sender reclaims after lock expires
- `test_refund_before_timelock_panics` — panics with `"time-lock active"`
- `test_double_release_panics` — panics with `"already released"`

### 1.5 streaming_contract

**Storage:** one `StreamState` per `stream_id` (Symbol key).

```rust
pub struct StreamState {
    pub sender: Address,
    pub receiver: Address,
    pub token: Address,
    pub rate_per_sec: i128,   // stroops per second
    pub deposit: i128,        // total locked upfront
    pub transferred: i128,    // cumulative paid to receiver
    pub last_tick: u64,       // ledger timestamp of last settlement
    pub closed: bool,
}
```

**Functions:**

| Function | Auth | Description |
|----------|------|-------------|
| `open_stream(stream_id, sender, receiver, token, deposit, rate_per_sec)` | sender | Locks deposit, starts stream at current timestamp |
| `tick(stream_id)` | anyone | Settles `rate × elapsed` to receiver; capped at remaining deposit |
| `close_stream(stream_id, caller)` | sender or receiver | Final tick + refunds leftover deposit to sender |
| `get_stream(stream_id)` | — | View current state |

**Rate formula:**
```
due = min(rate_per_sec × (now − last_tick), deposit − transferred)
```

**Tests (5):**
- `test_open_and_tick` — 50s elapsed at 100 stroops/s → 5000 transferred
- `test_tick_caps_at_deposit` — 100s at 100/s but deposit=500 → capped at 500
- `test_close_stream_refunds_leftover` — 30s elapsed, leftover returned to sender
- `test_double_close_panics` — panics with `"already closed"`
- `test_tick_on_closed_stream_panics` — panics with `"stream closed"`

### 1.6 Build & Test

```bash
# from repo root
source ~/.cargo/env
cargo build          # compiles both contracts
cargo test           # runs all 9 tests
```

**Test results:** 4 escrow + 5 streaming = **9/9 passing**

### 1.7 Deployment (Testnet)

```bash
# Build WASM
cargo build --target wasm32-unknown-unknown --release

# Deploy via Stellar CLI
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow_contract.wasm \
  --network testnet --source <keypair>

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/streaming_contract.wasm \
  --network testnet --source <keypair>
```

---

## 2. Backend Repo — `stellar-micropay-stream/backend`

### 2.1 Purpose

The backend is the **streaming orchestrator**. It sits between the frontend and the Stellar network, managing:
- Payment session lifecycle (open → stream → close)
- Scheduling micro-transactions at configurable intervals
- Off-chain payment channel state tracking
- Horizon API event streaming and webhook delivery
- Fraud detection and replay protection

### 3.2 Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js (TypeScript) | Async I/O fits streaming workloads |
| Framework | Express.js | Lightweight REST + WebSocket |
| Stellar SDK | `@stellar/stellar-sdk` | Official JS SDK for tx building |
| Horizon client | Horizon REST + SSE | Real-time payment event streaming |
| Database | PostgreSQL | Session state, channel records |
| Cache | Redis | Rate limiting, nonce tracking |
| Queue | BullMQ (Redis-backed) | Payment job scheduling |
| Auth | JWT + Stellar keypair signature | Trustless identity verification |

### 3.3 Directory Structure

```
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── sessions.ts        # POST /sessions, DELETE /sessions/:id
│   │   │   ├── payments.ts        # GET /payments/stream (SSE), POST /payments/send
│   │   │   └── channels.ts        # POST /channels/open, POST /channels/close
│   │   └── middleware/
│   │       ├── auth.ts            # JWT + Stellar signature verification
│   │       └── rateLimit.ts       # Per-wallet rate limiting via Redis
│   │
│   ├── services/
│   │   ├── paymentScheduler.ts    # BullMQ job: fires payments on interval
│   │   ├── streamManager.ts       # Manages active streaming sessions
│   │   ├── channelService.ts      # Off-chain channel state machine
│   │   └── fraudDetector.ts       # Replay attack + overcharge detection
│   │
│   ├── stellar/
│   │   ├── horizonClient.ts       # Horizon API wrapper + SSE listener
│   │   ├── txBuilder.ts           # Builds + signs Stellar transactions
│   │   └── sorobanClient.ts       # Invokes Soroban contract functions
│   │
│   ├── models/
│   │   ├── Session.ts             # Payment session schema
│   │   ├── Channel.ts             # Off-chain channel state
│   │   └── PaymentRecord.ts       # Immutable payment log
│   │
│   ├── workers/
│   │   └── paymentWorker.ts       # BullMQ worker: processes scheduled payments
│   │
│   └── index.ts                   # App entry point
│
├── prisma/
│   └── schema.prisma              # DB schema (Session, Channel, PaymentRecord)
├── .env.example
├── package.json
└── tsconfig.json
```

### 2.4 Core Modules

#### `streamManager.ts`
Central registry of all active payment streams. Each stream has:
- `sessionId` — UUID
- `sender` / `receiver` — Stellar public keys
- `ratePerSec` — XLM amount per second (string, 7 decimal precision)
- `mode` — `"onchain"` | `"channel"`
- `status` — `"active"` | `"paused"` | `"closed"`

```typescript
interface StreamSession {
  sessionId: string;
  sender: string;       // G... public key
  receiver: string;
  ratePerSec: string;   // e.g. "0.0000100"
  mode: "onchain" | "channel";
  startedAt: number;    // Unix timestamp
  lastPaymentAt: number;
  status: "active" | "paused" | "closed";
}
```

#### `paymentScheduler.ts`
Uses BullMQ to enqueue a repeating job per active session. On each tick:
1. Calculates `elapsed = now - lastPaymentAt`
2. Computes `amount = ratePerSec * elapsed`
3. Delegates to `txBuilder` (on-chain) or `channelService` (off-chain)
4. Updates `lastPaymentAt` in Redis

#### `channelService.ts`
Implements a Starlight-style off-chain payment channel:
- **Open:** Locks funds in Soroban escrow contract, stores channel state locally
- **Update:** Exchanges signed state updates (sequence number + balance delta) — no chain tx
- **Close:** Submits final signed state to Soroban contract for settlement

Channel state object:
```typescript
interface ChannelState {
  channelId: string;
  contractId: string;   // Soroban escrow contract address
  senderBalance: string;
  receiverBalance: string;
  sequenceNumber: number;
  senderSig: string;
  receiverSig: string;
}
```

#### `horizonClient.ts`
Wraps Stellar Horizon with:
- `streamPayments(accountId, onPayment)` — SSE listener for incoming payments
- `submitTx(xdr)` — submits signed transaction XDR
- `getAccountInfo(publicKey)` — fetches sequence number + balances

#### `txBuilder.ts`
Builds Stellar transactions for on-chain streaming mode:
- Uses `stellar-sdk` `TransactionBuilder`
- Attaches memo with `sessionId` for reconciliation
- Handles sequence number management via Redis lock to prevent conflicts

### 2.5 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions` | Start a new payment stream |
| `GET` | `/sessions/:id` | Get session status |
| `DELETE` | `/sessions/:id` | Stop/close a stream |
| `GET` | `/payments/stream` | SSE: real-time payment events for a wallet |
| `POST` | `/channels/open` | Open an off-chain payment channel |
| `POST` | `/channels/update` | Submit a signed channel state update |
| `POST` | `/channels/close` | Close channel and settle on-chain |
| `GET` | `/health` | Health check |

### 2.6 Payment Flow (On-Chain Mode)

```
Client → POST /sessions { sender, receiver, ratePerSec, mode: "onchain" }
  → streamManager creates session
  → paymentScheduler enqueues repeating job (interval: 2s default)
    → every tick: txBuilder.buildPaymentTx(sender, receiver, amount)
    → horizonClient.submitTx(signedXdr)
    → PaymentRecord saved to DB
  → Client receives SSE events via GET /payments/stream
```

### 2.7 Payment Flow (Off-Chain Channel Mode)

```
Client → POST /channels/open { sender, receiver, depositAmount }
  → sorobanClient.invokeContract("open_channel", { sender, receiver, deposit })
  → Channel record created in DB with sequenceNumber=0

Client → POST /channels/update { channelId, amount, senderSig }
  → channelService validates sig + sequence
  → Updates local channel state (no chain tx)
  → Returns updated state with receiverSig

Client → POST /channels/close { channelId }
  → sorobanClient.invokeContract("close_channel", { finalState })
  → Soroban contract verifies sigs + settles balances
```

### 2.8 Security

- **Replay protection:** Each payment carries a `nonce` stored in Redis with TTL
- **Signature verification:** All channel state updates verified against sender's Stellar keypair
- **Rate limiting:** Per-wallet request limits via Redis sliding window
- **Sequence numbers:** Monotonically increasing per channel; old states rejected
- **Time-locks:** Soroban contract enforces dispute window before unilateral close

### 2.9 Environment Variables

```env
STELLAR_NETWORK=testnet                    # testnet | mainnet
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ESCROW_ID=C...                    # Deployed escrow contract address
CONTRACT_STREAM_ID=C...                    # Deployed streaming contract address
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=...
SERVER_SECRET_KEY=S...                     # Backend's Stellar signing key (for fee bumps)
PAYMENT_INTERVAL_MS=2000                   # Default streaming tick interval
```

---

## 3. Frontend Repo — `stellar-micropay-stream/frontend`

### 3.1 Purpose

The frontend is the **streaming UI** — a real-time dashboard where users:
- Connect their Stellar wallet (Freighter)
- Start/stop payment streams to any Stellar address
- Monitor live balance changes and payment history
- Manage off-chain payment channels

### 3.2 Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Wallet | Freighter API (`@stellar/freighter-api`) |
| Stellar SDK | `@stellar/stellar-sdk` (client-side tx signing) |
| State | Zustand |
| Data fetching | TanStack Query (React Query) |
| Real-time | Native `EventSource` (SSE from backend) |
| Charts | Recharts (balance over time) |

### 3.3 Directory Structure

```
frontend/
├── app/
│   ├── layout.tsx                 # Root layout, wallet provider
│   ├── page.tsx                   # Landing / connect wallet
│   ├── dashboard/
│   │   └── page.tsx               # Main streaming dashboard
│   ├── channels/
│   │   └── page.tsx               # Payment channel management
│   └── history/
│       └── page.tsx               # Payment history + export
│
├── components/
│   ├── wallet/
│   │   ├── ConnectButton.tsx      # Freighter connect/disconnect
│   │   └── WalletStatus.tsx       # Balance + address display
│   ├── stream/
│   │   ├── StreamControls.tsx     # Start/stop stream, rate slider
│   │   ├── StreamCard.tsx         # Active stream display card
│   │   └── PaymentTicker.tsx      # Live payment event feed
│   ├── channel/
│   │   ├── ChannelList.tsx        # Open channels list
│   │   ├── OpenChannelModal.tsx   # Open new channel form
│   │   └── ChannelStateBar.tsx    # Visual balance bar
│   ├── charts/
│   │   └── BalanceChart.tsx       # Real-time balance line chart
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Modal.tsx
│
├── hooks/
│   ├── useWallet.ts               # Freighter connection + signing
│   ├── useStream.ts               # Start/stop stream, SSE listener
│   ├── useChannel.ts              # Channel open/update/close
│   └── usePaymentHistory.ts       # Paginated payment records
│
├── lib/
│   ├── api.ts                     # Backend API client (fetch wrapper)
│   ├── stellar.ts                 # Stellar SDK helpers (keypair, XDR)
│   └── freighter.ts               # Freighter wallet adapter
│
├── store/
│   └── streamStore.ts             # Zustand: active sessions, wallet state
│
├── public/
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

### 3.4 Core Hooks

#### `useWallet.ts`
```typescript
// Manages Freighter wallet connection
const { publicKey, isConnected, connect, disconnect, signTransaction } = useWallet();
```
- Calls `getPublicKey()` from `@stellar/freighter-api`
- Stores `publicKey` in Zustand
- `signTransaction(xdr)` — passes XDR to Freighter for user signing

#### `useStream.ts`
```typescript
const { startStream, stopStream, activeStreams, payments } = useStream();
```
- `startStream({ receiver, ratePerSec, mode })` → `POST /sessions`
- Opens `EventSource` to `GET /payments/stream?wallet={publicKey}`
- Appends incoming payment events to `payments` array in real-time
- `stopStream(sessionId)` → `DELETE /sessions/:id`

#### `useChannel.ts`
```typescript
const { openChannel, updateChannel, closeChannel, channels } = useChannel();
```
- `openChannel({ receiver, depositAmount })` → signs deposit tx via Freighter → `POST /channels/open`
- `updateChannel(channelId, amount)` → signs state update → `POST /channels/update`
- `closeChannel(channelId)` → `POST /channels/close`

### 3.5 Key Components

#### `StreamControls.tsx`
Main control panel on the dashboard:
- Address input for receiver
- Rate slider: `0.000001 XLM/s` → `0.01 XLM/s` (logarithmic scale)
- Mode toggle: On-chain / Channel
- Start/Stop button
- Estimated cost display: `rate × 3600 = cost/hour`

#### `PaymentTicker.tsx`
Real-time feed of payment events from SSE:
- Renders last 50 payments
- Each entry: timestamp, amount, receiver, tx hash (linked to Stellar Expert)
- Auto-scrolls to latest

#### `BalanceChart.tsx`
Recharts `LineChart` showing wallet XLM balance over the current session:
- Polls `GET /accounts/{publicKey}` via Horizon every 5s
- Plots balance vs. time
- Highlights stream start/stop events as vertical markers

### 3.6 Wallet Integration (Freighter)

```typescript
// lib/freighter.ts
import { getPublicKey, signTransaction, isConnected } from "@stellar/freighter-api";

export async function connectWallet(): Promise<string> {
  if (!(await isConnected())) throw new Error("Freighter not installed");
  return getPublicKey();
}

export async function signTx(xdr: string, network: string): Promise<string> {
  return signTransaction(xdr, { network });
}
```

The backend builds and returns unsigned XDR for channel operations; the frontend signs via Freighter and submits back.

### 3.7 State Management (Zustand)

```typescript
// store/streamStore.ts
interface StreamStore {
  publicKey: string | null;
  activeSessions: StreamSession[];
  openChannels: ChannelState[];
  recentPayments: PaymentEvent[];
  setPublicKey: (key: string) => void;
  addSession: (s: StreamSession) => void;
  removeSession: (id: string) => void;
  appendPayment: (p: PaymentEvent) => void;
}
```

### 3.8 Environment Variables

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_ESCROW_CONTRACT_ID=C...
```

### 3.9 Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — connect wallet CTA |
| `/dashboard` | Active streams, rate controls, live payment ticker |
| `/channels` | Open/close payment channels, channel balance bars |
| `/history` | Full payment history, filterable, CSV export |

---

## 4. Backend ↔ Frontend Integration

### Data Flow

```
Freighter Wallet
     │  sign XDR
     ▼
Frontend (Next.js)
     │  REST + SSE
     ▼
Backend (Express)
     │  Horizon API / Soroban RPC
     ▼
Stellar Network
     │  events (SSE)
     ▼
Backend → SSE → Frontend → UI update
```

### Signing Flow for Channel Operations

1. Frontend calls `POST /channels/open` with `{ sender, receiver, depositAmount }`
2. Backend builds unsigned deposit transaction XDR, returns it
3. Frontend passes XDR to Freighter → user signs
4. Frontend submits signed XDR back to `POST /channels/open/submit`
5. Backend broadcasts to Horizon, records channel state

### Real-Time Payment Events (SSE)

```
GET /payments/stream?wallet=G...
Content-Type: text/event-stream

data: {"type":"payment","sessionId":"...","amount":"0.0000200","txHash":"...","timestamp":1746451063}

data: {"type":"payment","sessionId":"...","amount":"0.0000200","txHash":"...","timestamp":1746451065}
```

Frontend `EventSource` listener appends each event to the Zustand store, triggering React re-renders for the ticker and chart.

---

## 5. Development Setup

### Contracts

```bash
cd contract
source ~/.cargo/env          # if Rust was just installed
cargo build                  # dev build
cargo test                   # 9 tests, all pass
cargo build --target wasm32-unknown-unknown --release  # WASM for deployment
```

### Backend

```bash
cd backend
cp .env.example .env          # fill in keys
npm install
npx prisma migrate dev        # set up DB
npm run dev                   # starts on :3001
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # starts on :3000
```

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Freighter browser extension (for frontend testing)
- Stellar testnet account funded via [friendbot](https://friendbot.stellar.org)

---

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Off-chain channels | Starlight-style state updates | Avoids per-second on-chain txs; only 2 chain txs per session |
| Signing model | Client-side via Freighter | Private keys never leave user's browser |
| Streaming protocol | SSE over WebSocket | Simpler, HTTP-native, sufficient for unidirectional payment events |
| Scheduler | BullMQ | Persistent jobs survive backend restarts; Redis-backed |
| DB | PostgreSQL + Prisma | Strong consistency for financial records; typed schema |
| Frontend state | Zustand | Minimal boilerplate; works well with SSE event appending |
