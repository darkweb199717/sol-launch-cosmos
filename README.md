# SolLaunch Cosmos — Devnet preview

Cosmic-themed Solana Devnet launchpad with Phantom wallet integration and an experimental Raydium CPMM pool-creation flow.

## Current features
- Solana Devnet wallet and token dashboard
- Token creation UI (metadata upload service is disabled on public hosting)
- Raydium CPMM Devnet pool transaction builder via `POST /api/raydium/build`
- Phantom signing in the browser; no wallet secret keys stored on the server
- Mint, balance, pool existence, Devnet genesis and transaction confirmation checks
- Local browser token history and liquidity price planner

## Limitations and safety
- **Experimental; Raydium pool creation has not passed an end-to-end live Devnet test.** Do not use on Mainnet.
- Raydium SDK is pinned to an alpha version. Test with throwaway Devnet mints and small deposits.
- Metadata uploads are disabled; creating a brand-new token with metadata is unavailable until a secure IPFS upload service is configured.
- Swaps, production market data, and Mainnet transactions are not implemented.
- Pool creation may spend Devnet SOL on fees and rent, and deposits both tokens. Phantom approval is required.
- The public endpoint returns a serialized unsigned/partially signed transaction; clients must review its programs, account addresses and amounts before signing.

## Render
Build: `npm install && npm run setup`
Start: `npm start`
Node: 22
Health: `/health`
Expected URL: https://sollaunch-cosmos.onrender.com
