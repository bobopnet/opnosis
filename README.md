# OPNosis

A Bitcoin-native batch auction platform built on [OPNet](https://opnet.org) (Bitcoin Layer 1). OPNosis is a faithful port of [Gnosis EasyAuction](https://github.com/gnosis/ido-contracts) to OPNet, implementing a uniform-price batch auction mechanism where all winning bidders pay the same clearing price.

## How It Works

1. An **auctioneer** calls `initiateAuction()` to deposit auctioning tokens and set a minimum price.
2. **Bidders** call `placeSellOrders()` to deposit bidding tokens and specify their desired rate.
3. Bidders may cancel orders before the cancellation deadline via `cancelSellOrders()`.
4. After the auction ends, anyone calls `precalculateSellAmountSum()` (optional, for large auctions) then `settleAuction()`.
5. Each bidder calls `claimFromParticipantOrder()` to receive their tokens.

The clearing price is determined by walking sorted orders from best to worst price until the cumulative bidding tokens cover the full auctioned amount. All winning bidders pay this uniform clearing price. If the minimum funding threshold is not met, all participants are fully refunded.

## Project Structure

```
opnosis/
  contracts/   -- Smart contract (AssemblyScript -> WebAssembly)
  shared/      -- Shared types, ABI, constants, contract wrapper
  backend/     -- hyper-express REST API + auction indexer
  frontend/    -- React 18 + Vite frontend with OP_WALLET
  tests/       -- Integration test suites (node:test + tsx)
```

Each directory is its own sub-project with its own `package.json`. They share types and constants through `@opnosis/shared`.

## Prerequisites

- Node.js 20+
- An [OP_WALLET](https://opnet.org) browser extension (for frontend interaction)
- Access to an OPNet node (testnet: `https://testnet.opnet.org`, mainnet: `https://mainnet.opnet.org`)

## Build Order

Build sub-projects in dependency order:

```bash
# 1. Smart contract
cd contracts && npm install && npm run build

# 2. Shared library (typecheck only -- consumed as source by other sub-projects)
cd shared && npm install && npm run typecheck

# 3. Backend
cd backend && npm install && npm run build

# 4. Frontend
cd frontend && npm install && npm run build
```

## Smart Contract

The contract is written in AssemblyScript and compiled to WebAssembly via the OPNet toolchain.

### Public Methods

| Method | Description |
|--------|-------------|
| `initiateAuction()` | Create a new batch auction (deposits auctioning tokens + fee) |
| `placeSellOrders()` | Place one or more bid orders (deposits bidding tokens) |
| `cancelSellOrders()` | Cancel orders before the cancellation deadline (refunds bidding tokens) |
| `precalculateSellAmountSum()` | Advance the settlement sweep in batches (for large auctions) |
| `settleAuction()` | Finalize the auction, determine clearing price, distribute proceeds |
| `claimFromParticipantOrder()` | Claim tokens after settlement (winning: auctioning tokens, losing: refund) |
| `setFeeParameters()` | Update protocol fee and receiver (owner-only, max 1.5%) |

### Read-Only Methods

| Method | Description |
|--------|-------------|
| `getUserId(address)` | Look up a user's internal ID (0 if unregistered) |
| `getAuctionData(auctionId)` | Full auction parameters and status |
| `getClearingOrder(auctionId)` | Clearing price and settlement data (settled auctions only) |
| `getFeeParameters()` | Current global fee numerator and receiver |

### Design Decisions

- **Bounded order book**: MAX_ORDERS = 100 per auction with insertion-sort (O(n) per insert, O(1) rank lookup via reverse map).
- **SafeMath everywhere**: All u256 arithmetic uses SafeMath -- no raw operators.
- **No `while` loops**: All loops are bounded `for` loops.
- **Reentrancy guard**: All state-changing entry points are protected.
- **Fee snapshot**: Fee parameters are snapshotted at auction creation to prevent owner front-running.
- **CEI pattern**: Checks-Effects-Interactions ordering on all entry points.
- **Overflow guards**: `mulWouldOverflow` checks before cross-multiplication with fallback to division-first computation.

### Storage Layout

The contract uses 36 sequential storage pointers (0-35) allocated via `Blockchain.nextPointer`. See the header comment in `contracts/src/opnosis/Opnosis.ts` for the complete layout.

## Backend

A read-only REST API server using hyper-express that indexes auction data from the blockchain.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with network and contract info |
| `GET /auctions` | List all indexed auctions |
| `GET /auctions/:id` | Get a single auction's details |
| `GET /auctions/:id/clearing` | Get clearing data for a settled auction |
| `GET /fee-parameters` | Current protocol fee parameters |

### Configuration

Copy `.env.example` to `.env` and configure:

```env
OPNET_RPC_URL=https://testnet.opnet.org/v1/json-rpc
OPNOSIS_CONTRACT=<deployed-contract-address>
NETWORK=testnet
PORT=3001
CORS_ORIGIN=http://localhost:5173
CACHE_TTL_MS=30000
INDEXER_POLL_MS=15000
```

### Running

```bash
cd backend

# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## Frontend

A React 18 + Vite single-page application with OP_WALLET integration.

### Features

- **Browse auctions**: Grid view of all auctions with status badges (open, settled, failed)
- **Create auctions**: Two-step form (approve token, then create)
- **Place bids**: Bid on active auctions with custom sell/buy amounts
- **Settle auctions**: One-click settlement after the auction end date
- **Claim tokens**: Claim won tokens or refunds after settlement
- **Auto-refresh**: UI refreshes automatically after successful transactions

### Configuration

Set environment variables (via `.env` or Vite config):

```env
VITE_API_URL=http://localhost:3001
VITE_OPNOSIS_CONTRACT=<deployed-contract-address>
```

### Running

```bash
cd frontend

# Development
npm run dev

# Production build
npm run build
npm run preview
```

## Tests

7 test suites with 38 test cases covering the full auction lifecycle:

| Suite | Cases | Coverage |
|-------|-------|----------|
| `lifecycle.test.ts` | 4 | Full auction flow end-to-end |
| `initiate.test.ts` | 5 | Auction creation and validation |
| `orders.test.ts` | 8 | Order placement and cancellation edge cases |
| `settlement.test.ts` | 7 | Precalculation and settlement scenarios |
| `claims.test.ts` | 5 | Token claiming (won, lost, cancelled, failed) |
| `fees.test.ts` | 5 | Fee parameters and snapshot integrity |
| `views.test.ts` | 4 | Read-only view functions |

Tests are scaffolded with TODO implementations awaiting a live testnet environment.

```bash
cd tests && npm install

# Set the deployed contract address
export OPNOSIS_CONTRACT=<address>

# Run tests
npm test
```

## Shared Library

The `@opnosis/shared` package provides:

- **`OPNOSIS_ABI`** -- Contract ABI with proper `BitcoinAbiTypes.Function` format
- **`OP_20_ABI`** -- Standard OP20 token ABI (re-exported from opnet SDK)
- **`OpnosisContract`** -- Typed wrapper around `getContract()` with simulation methods
- **Constants** -- `MAX_ORDERS`, `FEE_DENOMINATOR`, `BASE_UNIT`, `TOKEN_DECIMALS`
- **Formatting** -- `formatTokenAmount()`, `parseTokenAmount()`, `formatTimestamp()`, `formatPrice()`
- **Network config** -- `NETWORK_CONFIGS`, `getNetworkConfig()`
- **Types** -- `AuctionData`, `ClearingData`, `AuctionStatus`, `WalletState`, `TxState`

## Deployment

### Contract

1. Build the contract: `cd contracts && npm run build`
2. Deploy to testnet first using [opnet-cli](https://github.com/btc-vision/opnet-cli)
3. Save the deployed contract address

### Backend

1. Set environment variables (see Configuration above)
2. Build and start: `npm run build && npm start`
3. Verify with `GET /health`

### Frontend

1. Set `VITE_OPNOSIS_CONTRACT` and `VITE_API_URL`
2. Build: `npm run build`
3. Deploy `dist/` to IPFS, a .btc domain, or any static hosting

## Technology Stack

| Component | Technology |
|-----------|------------|
| Smart Contract | AssemblyScript, `@btc-vision/btc-runtime` |
| Shared | TypeScript, `opnet` SDK, `@btc-vision/transaction` |
| Backend | hyper-express, `opnet` JSONRpcProvider |
| Frontend | React 18, Vite, OP_WALLET |
| Tests | node:test, tsx |
| Bitcoin Library | `@btc-vision/bitcoin` (OPNet fork) |

## Network Support

| Network | RPC URL | Bitcoin Network |
|---------|---------|-----------------|
| Testnet | `https://testnet.opnet.org/v1/json-rpc` | `networks.opnetTestnet` |
| Mainnet | `https://mainnet.opnet.org/v1/json-rpc` | `networks.bitcoin` |
