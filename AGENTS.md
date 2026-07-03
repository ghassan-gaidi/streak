# AGENTS.md — Streak

> Crypto price data API. CF Worker with Polar subscription.
> Live at: crypto-price-api.leo2574.workers.dev

## Endpoints
- `GET /health` — Health check
- `GET /price/bitcoin` — BTC price
- `GET /price/{coin}` — Any coin price
- `GET /day` — Daily summary

## Tech
- Cloudflare Worker (ES module)
- Wrangler for deployment
- Polar subscription ($5/mo Pro)

## Commands
```bash
npm run dev    # wrangler dev
npm run deploy # wrangler deploy
```
