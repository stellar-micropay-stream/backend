# stellar-micropay-stream — Backend

Streaming orchestrator for real-time micropayments on the Stellar network. Manages payment session lifecycle, schedules micro-transactions via BullMQ, tracks off-chain payment channel state, and streams live payment events to clients over SSE.

Part of the [stellar-micropay-stream](https://github.com/stellar-micropay-stream) org alongside `contract` and `frontend`.

---

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express.js |
| Stellar SDK | `@stellar/stellar-sdk` |
| Queue | BullMQ (Redis-backed) |
| Database | PostgreSQL + Prisma |
| Auth | JWT + Stellar keypair |

---

## Project Structure

```
src/
├── api/
│   ├── middleware/       # JWT auth, rate limiting
│   └── routes/           # sessions, payments, channels
├── services/
│   ├── streamManager.ts  # in-memory session registry
│   ├── paymentScheduler.ts # BullMQ job scheduling
│   └── channelService.ts # off-chain channel state machine
├── stellar/
│   ├── horizonClient.ts  # Horizon API wrapper + SSE
│   └── txBuilder.ts      # Stellar transaction builder
├── workers/
│   └── paymentWorker.ts  # processes payment ticks
└── index.ts              # app entry point
prisma/
└── schema.prisma         # Session, Channel, PaymentRecord
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Setup

```bash
cp .env.example .env      # fill in your keys
npm install
npx prisma migrate dev
npm run dev               # starts on :3001
```

### Environment Variables

```env
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ESCROW_ID=C...
CONTRACT_STREAM_ID=C...
DATABASE_URL=postgresql://user:password@localhost:5432/micropay
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret
SERVER_SECRET_KEY=S...
PAYMENT_INTERVAL_MS=2000
PORT=3001
```

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `POST` | `/sessions` | ✓ | Start a payment stream |
| `GET` | `/sessions/:id` | ✓ | Get session status |
| `DELETE` | `/sessions/:id` | ✓ | Stop a stream |
| `GET` | `/payments/stream?wallet=G...` | — | SSE payment events |
| `POST` | `/payments/send` | ✓ | One-off payment |
| `POST` | `/channels/open` | ✓ | Open off-chain channel |
| `POST` | `/channels/update` | ✓ | Submit signed state update |
| `POST` | `/channels/close` | ✓ | Close and settle channel |
| `GET` | `/channels/:id` | ✓ | Get channel state |

See [`frontend.md`](./frontend.md) for full request/response shapes.

---

## Payment Modes

**On-chain** — BullMQ fires a tick every `PAYMENT_INTERVAL_MS`. Each tick builds and submits a Stellar payment transaction via Horizon.

**Off-chain channel** — Funds locked in Soroban escrow contract upfront. Payments are signed state updates exchanged locally (no chain tx). Final balance settled on-chain when channel closes. Only 2 chain transactions per session.

---

## Testing

```bash
npm test
```

12 tests across 3 suites: `streamManager`, `horizonClient`, `sessions` route.

---

## Related Repos

- [`contract`](https://github.com/stellar-micropay-stream/contract) — Soroban escrow + streaming contracts (9 tests, ✅ done)
- [`frontend`](https://github.com/stellar-micropay-stream/frontend) — Next.js dashboard with Freighter wallet integration
