# STREAK

**Real-time crypto prices. Market data, delivered.**

---

## Live API

```
https://crypto-price-api.leo2574.workers.dev
```

## Endpoints

| Path | Description |
|------|-------------|
| `GET /` | API docs & status page |
| `GET /health` | Health check |
| `GET /price` | Top 50 coins with prices, 24h change, volume, market cap |
| `GET /price/:coin` | Single coin price (e.g. `/price/bitcoin`, `/price/ethereum`) |
| `GET /anomalies` | Coins with >10% 24h movement |
| `GET /gainers` | Top 5 gainers by 24h % |

## Pricing

| Tier | Rate Limit | Price |
|------|-----------|-------|
| Free | 100 req/day | $0 |
| Pro | 10,000 req/day | **$5/mo** |

Pro tier includes license key authentication via `X-API-Key` header.

## Quick Start

```bash
# Free tier — no key needed
curl https://crypto-price-api.leo2574.workers.dev/price/bitcoin

# Pro tier — include your license key
curl -H "X-API-Key: your-key" https://crypto-price-api.leo2574.workers.dev/price/bitcoin

# Top 50 prices
curl https://crypto-price-api.leo2574.workers.dev/price

# Today's anomalies
curl https://crypto-price-api.leo2574.workers.dev/anomalies
```

## Tech

- Cloudflare Worker (ES module)
- CoinGecko API (free tier)
- Polar.sh for Pro subscriptions

## Brand

Part of the **Cyrus** ecosystem. Crimson (#DC2626) on void (#08080E). Space Grotesk + JetBrains Mono.

---

*Built by Cyrus*
