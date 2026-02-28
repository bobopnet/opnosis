# CLAUDE.md -- OPNet Full-Stack Project

## Project Description

This is a full-stack project built on Bitcoin Layer 1 with OP_NET. It consists of:
- **Smart contract(s)** -- AssemblyScript, compiled to WebAssembly
- **Frontend** -- React app with OP_WALLET integration
- **Backend** -- hyper-express API for data indexing and serving

## Required Reading

Before writing ANY code, read the relevant skill docs:
- `opnet-development` skill: contracts, backend, security, package versions
- `crypto-frontend-design` skill: frontend patterns, wallet integration
- `opnet-cli` skill: deployment, .btc domains

## Project Structure

```
/contracts     -- Smart contract source (AssemblyScript)
/frontend      -- React frontend application
/backend       -- hyper-express API server
/shared        -- Shared types and constants
```

Each directory is its own sub-project with its own package.json. They share types and constants through the /shared directory.

---

## Package Rules (ALL Components)

### ALWAYS Use
- `@btc-vision/bitcoin` -- Bitcoin library (OPNet fork)
- `@btc-vision/ecpair` -- EC pair library (OPNet fork)
- `@btc-vision/transaction` -- Transaction construction and ABI types
- `opnet` -- OPNet SDK, provider, contract interaction

### NEVER Use
- `bitcoinjs-lib` -- wrong Bitcoin library
- `ecpair` -- wrong EC pair library
- `tiny-secp256k1` -- use `@noble/curves` instead
- `ethers` or `web3` -- Ethereum libraries
- `express`, `fastify`, `koa` -- wrong backend framework

### Package Versions
- Check the opnet-development skill setup-guidelines for exact versions
- Do not guess -- wrong versions cause type mismatches and broken builds

---

## Smart Contract Rules

### Architecture
- Constructor runs on EVERY interaction -- use `onDeployment()` for one-time init
- All state stored via unique storage pointers (no collisions)
- Extend the appropriate base: OP20, OP721, or OP_NET base

### Safety
- SafeMath for ALL u256 arithmetic -- no raw operators
- No `while` loops -- bounded `for` loops only
- No iterating all map keys -- store aggregates separately
- Validate all inputs (zero address, zero amount, overflow)

### Access Control
- Owner-only functions: `Revert.ifNotOwner(this, msg.sender)`
- Validate caller permissions before modifying state

---

## Frontend Rules

### Wallet
- OP_WALLET only -- NEVER MetaMask
- Use `@btc-vision/walletconnect` for connection modal
- ALWAYS include WalletConnect popup CSS fix
- signer and mldsaSigner are NULL on frontend -- wallet extension signs

### Provider
- Create a SEPARATE `JSONRpcProvider` for all read operations
- NEVER use WalletConnect provider for reads
- Testnet: `https://testnet.opnet.org`
- Mainnet: `https://mainnet.opnet.org`

### Contract Interaction
- Use `getContract<T>(address, abi, provider, network, sender)` from opnet
- ALWAYS simulate before sending transactions
- Check `'error' in simulation` before proceeding
- NEVER put private keys in frontend code

### UI
- TypeScript, React functional components
- Dark theme, responsive design
- Loading states, error handling, success feedback
- Auto-refresh after transactions

---

## Backend Rules

### Framework
- hyper-express ONLY -- Express, Fastify, Koa are FORBIDDEN
- CORS support enabled
- Proper error handling on all endpoints

### Blockchain Queries
- Use `JSONRpcProvider` from opnet for all chain data
- NEVER use fetch/axios to call external blockchain APIs
- NEVER use mempool.space, blockstream, or similar services

### Backend Signers
- Backend CAN use real signers: `signer: wallet.keypair, mldsaSigner: wallet.mldsaKeypair`
- Store keys in environment variables, NEVER hardcode
- Use `.env` files, add `.env` to `.gitignore`

### Data
- Cache blockchain data to avoid redundant RPC calls
- Serve indexed/processed data to the frontend via REST endpoints
- Use proper HTTP status codes (200, 400, 404, 500)

---

## Cross-Component Rules

### Shared Types
- Define shared interfaces and constants in `/shared`
- Contract addresses, ABIs, and network config live in shared
- Both frontend and backend import from shared -- no duplication

### Network Configuration
- Support both testnet and mainnet via environment variable
- Default to testnet in development
- Frontend reads network from OP_WALLET connection
- Backend reads network from environment

### Development
- Frontend: `cd frontend && npx vite --host 0.0.0.0` (Vite dev server, no build needed)
- Backend: `cd backend && npx tsx src/index.ts` (runs TypeScript directly)
- Contracts: must be compiled before deployment (`cd contracts && npm run build`)

### Production Build Order
1. Contracts first (`cd contracts && npm install && npm run build`)
2. Shared types (if separate build step)
3. Backend (`cd backend && npm install && npm run build`)
4. Frontend (`cd frontend && npm install && npm run build`) — only for static deployment

---

## Deployment

### Contract
- Test on testnet first, always
- Use opnet-cli for deployment
- Save deployed contract address in shared config

### Backend
- Standard Node.js deployment (any hosting provider)
- Set environment variables for network, RPC URLs, and keys
- Never expose private endpoints without authentication

### Frontend
- `npm run build` produces static files in `dist/`
- Deploy to IPFS, .btc domain, or any static hosting
- Update contract address and backend URL for production

---

## Before Finalizing

1. Run audit checklist from opnet-development skill on all contracts
2. Verify all storage pointers are unique
3. Verify SafeMath used everywhere in contracts
4. Verify no private keys in frontend code
5. Verify .env is in .gitignore
6. Test full flow: connect wallet, interact with contract via frontend, verify backend serves correct data
7. Test on testnet end-to-end before mainnet