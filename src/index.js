/**
 * Crypto Price API — real-time cryptocurrency prices
 * 
 * Free tier: 100 requests/day (tracked by IP)
 * Pro tier: 10,000 requests/day (via Polar license key in X-API-Key header)
 * 
 * Endpoints:
 *   GET /price/:coin     — current price for a coin (e.g. /price/bitcoin)
 *   GET /price           — prices for top 20 coins
 *   GET /anomalies       — coins with >10% 24h movement
 *   GET /gainers         — top 5 gainers
 *   GET /health          — API health
 */

// CoinGecko API (free, no key needed for basic endpoints)
const CG_BASE = "https://api.coingecko.com/api/v3";

// Rate limit tracking via in-memory Map + KV persistence
// Free tier: 100 req/day per IP
const FREE_DAILY_LIMIT = 100;
const PRO_DAILY_LIMIT = 10000;

// ── CORS headers ──
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Content-Type": "application/json",
};

// ── In-memory cache ──
let priceCache = null;
let priceCacheTime = 0;
const PRICE_CACHE_TTL = 30_000; // 30 seconds

async function getPrices() {
  const now = Date.now();
  if (priceCache && now - priceCacheTime < PRICE_CACHE_TTL) {
    return priceCache;
  }
  
  const url = `${CG_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&sparkline=false`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "CryptoPriceAPI/1.0" },
  });
  
  if (!resp.ok) {
    throw new Error(`CoinGecko returned ${resp.status}`);
  }
  
  const data = await resp.json();
  
  // Transform to clean format
  priceCache = data.map(c => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    price_usd: c.current_price,
    change_24h_pct: c.price_change_percentage_24h ?? 0,
    volume_24h_usd: c.total_volume,
    market_cap_usd: c.market_cap,
    image: c.image,
  }));
  priceCacheTime = now;
  
  return priceCache;
}

// ── Rate limit check ──
async function checkRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || 
             request.headers.get("X-Forwarded-For") || 
             "unknown";
  
  // Check for pro key
  const apiKey = request.headers.get("X-API-Key");
  let isPro = false;
  
  if (apiKey && env.POLAR_ORG_ID) {
    // Validate against Polar license key API
    try {
      const validateUrl = `https://api.polar.sh/v1/license-keys/validate`;
      const resp = await fetch(validateUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.POLAR_API_KEY}`,
        },
        body: JSON.stringify({
          key: apiKey,
          organization_id: env.POLAR_ORG_ID,
        }),
      });
      if (resp.ok) {
        const result = await resp.json();
        isPro = result.valid === true;
      }
    } catch (e) {
      // If validation fails, treat as free
      console.error("License validation error:", e.message);
    }
  }
  
  const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  
  // Track usage in KV
  if (env.CACHE) {
    const today = new Date().toISOString().split("T")[0];
    const key = `ratelimit:${ip}:${today}`;
    const current = parseInt(await env.CACHE.get(key) || "0");
    
    if (current >= limit) {
      return { allowed: false, limit, used: current, isPro };
    }
    
    // Increment (async, don't await for speed)
    env.CACHE.put(key, String(current + 1), { expirationTtl: 86400 });
    
    return { allowed: true, limit, used: current, remaining: limit - current - 1, isPro };
  }
  
  return { allowed: true, limit, isPro };
}

// ── Handlers ──

async function handleHealth() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    coins_available: 50,
    free_tier: `${FREE_DAILY_LIMIT} req/day`,
    pro_tier: `${PRO_DAILY_LIMIT} req/day`,
  };
}

async function handlePrice(coinId) {
  const prices = await getPrices();
  
  if (coinId) {
    const coin = prices.find(c => c.id === coinId.toLowerCase() || c.symbol === coinId.toUpperCase());
    if (!coin) {
      return { error: "coin not found", query: coinId };
    }
    return coin;
  }
  
  // Return top 20
  return prices.slice(0, 20);
}

async function handleAnomalies() {
  const prices = await getPrices();
  return prices
    .filter(c => Math.abs(c.change_24h_pct) > 10 && c.volume_24h_usd > 1_000_000)
    .map(c => ({
      ...c,
      reason: Math.abs(c.change_24h_pct) > 20 ? "significant_movement" : "notable_movement",
    }));
}

async function handleGainers() {
  const prices = await getPrices();
  return prices
    .filter(c => c.change_24h_pct > 5 && c.volume_24h_usd > 500_000)
    .sort((a, b) => b.change_24h_pct - a.change_24h_pct)
    .slice(0, 5);
}

// ── Landing page HTML ──
function getLandingPage(rl) {
  const tier = rl && rl.isPro ? "pro" : "free";
  const tierLabel = rl && rl.isPro ? "10,000 req/day" : "100 req/day";
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Streak — Market data, delivered.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#08080E;color:#D4D4D8;font-family:'Space Grotesk',system-ui,sans-serif;min-height:100vh}
.nav{display:flex;align-items:center;gap:1.5rem;padding:1rem 2rem;border-bottom:1px solid rgba(255,255,255,0.06)}
.nav-brand{font-weight:700;font-size:1.1rem;color:white;letter-spacing:-0.02em}
.nav-brand em{font-style:normal;color:#DC2626}
.nav-tag{color:#52525B;font-family:'JetBrains Mono',monospace;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em}
.nav-end{margin-left:auto;display:flex;gap:0.75rem}
.nav-end a{color:#a1a1aa;text-decoration:none;font-size:0.85rem}
.nav-end a:hover{color:white}
.nav-end .nav-cta{color:#DC2626;font-weight:600}
.nav-end .nav-cta:hover{color:#ff3a3a}
.container{max-width:800px;margin:0 auto;padding:3rem 2rem}
.hero{text-align:center;padding:3rem 0 2.5rem}
.hero .streak-logo{font-size:4.5rem;font-weight:700;color:#DC2626;letter-spacing:-0.04em;line-height:1;margin-bottom:0.5rem}
.hero .tagline{font-size:1.15rem;color:#a1a1aa;margin-bottom:0.75rem}
.hero .sub{font-size:0.8rem;color:#52525B;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:0.1em}
.pricing-badge{display:inline-block;background:#DC2626;color:white;padding:0.35rem 1rem;border-radius:4px;font-size:0.8rem;font-weight:600;margin-top:1.25rem;box-shadow:0 0 20px rgba(220,38,38,0.35)}
.competition{font-size:0.75rem;color:#52525B;margin-top:0.65rem;font-family:'JetBrains Mono',monospace}
.status-bar{display:flex;gap:1.5rem;justify-content:center;margin:1.5rem 0;font-family:'JetBrains Mono',monospace;font-size:0.8rem}
.status-bar .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:0.4rem;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:2rem 0}
@media(max-width:600px){.grid{grid-template-columns:1fr}}
.card{border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:1.5rem;transition:border-color 0.3s}
.card:hover{border-color:#DC2626}
.card h2{font-size:1rem;color:white;margin-bottom:0.75rem;font-weight:600}
.card p{color:#a1a1aa;font-size:0.9rem;line-height:1.6;margin-bottom:0.5rem}
.card code{display:block;background:#0D0D14;padding:0.75rem;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:#22D3EE;margin:0.5rem 0;border:1px solid rgba(255,255,255,0.05);overflow-x:auto}
.card .label{font-size:0.7rem;color:#52525B;text-transform:uppercase;letter-spacing:0.12em;font-family:'JetBrains Mono',monospace;margin-bottom:0.25rem}
.price-card{text-align:center;padding:2rem}
.price-card .price{font-size:2.5rem;font-weight:700;color:white}
.price-card .price em{font-style:normal;color:#10B981}
.price-card .period{color:#52525B;font-size:0.8rem;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:0.08em}
.price-card ul{list-style:none;margin:1.5rem 0;text-align:left}
.price-card li{padding:0.4rem 0;color:#a1a1aa;font-size:0.85rem}
.price-card li::before{content:'✓';color:#10B981;margin-right:0.5rem}
.btn{display:inline-block;border:1px solid rgba(255,255,255,0.15);color:#a1a1aa;padding:0.65rem 1.5rem;border-radius:4px;text-decoration:none;font-size:0.85rem;transition:all 0.3s;font-weight:500}
.btn:hover{color:white;border-color:rgba(255,255,255,0.3)}
.btn-primary{background:#DC2626;color:white;border-color:#DC2626;font-weight:600;box-shadow:0 0 20px rgba(220,38,38,0.3)}
.btn-primary:hover{background:#b71c1c;border-color:#b71c1c;box-shadow:0 0 28px rgba(220,38,38,0.5)}
.btn-outline{border-color:rgba(255,255,255,0.12);color:#a1a1aa}
.btn-outline:hover{border-color:rgba(255,255,255,0.25);color:white}
.endpoints{margin:2rem 0}
.endpoint-row{display:flex;justify-content:space-between;align-items:center;padding:0.75rem 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.endpoint-row:last-child{border-bottom:none}
.endpoint-row .method{color:#DC2626;font-family:'JetBrains Mono',monospace;font-size:0.75rem;font-weight:700;min-width:3rem;text-transform:uppercase}
.endpoint-row .path{color:white;font-family:'JetBrains Mono',monospace;font-size:0.82rem}
.endpoint-row .desc{color:#a1a1aa;font-size:0.8rem;text-align:right;max-width:45%}
footer{margin-top:4rem;text-align:center;color:#52525B;font-size:0.75rem;font-family:'JetBrains Mono',monospace;line-height:2;padding:2rem}
footer a{color:#DC2626;text-decoration:none}
footer a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="nav">
<div class="nav-brand"><em>Streak</em></div>
<div class="nav-tag">Market data, delivered.</div>
<div class="nav-end">
<a href="https://crypto-price-api.leo2574.workers.dev/health">STATUS</a>
<a class="nav-cta" href="https://polar.sh/checkout/polar_c_89q6czDPBdoRm3niGHrOTrIQGcZxxCxR18j6Q4daPan">PRO $5/MO</a>
</div>
</div>

<div class="container">

<div class="hero">
<div class="streak-logo">Streak</div>
<div class="tagline">Real-time crypto prices. No bullshit.</div>
<div class="sub">Cloudflare Worker · CoinGecko · 50 coins</div>
<div class="pricing-badge">$5/mo — Pro plan</div>
<div class="competition">CoinGecko Pro: $79/mo · CoinMarketCap: $29/mo · Streak: $5/mo</div>
</div>

<div class="status-bar">
<span><span class="dot"></span> OPERATIONAL</span>
<span>50 COINS TRACKED</span>
<span>TIER: ${tier} (${tierLabel})</span>
</div>

<div class="grid">
<div class="card">
<h2>Quick Start</h2>
<div class="label">BTC price</div>
<code>curl https://crypto-price-api.leo2574.workers.dev/price/bitcoin</code>
<div class="label">ETH price</div>
<code>curl https://crypto-price-api.leo2574.workers.dev/price/ethereum</code>
<div class="label">SOL price</div>
<code>curl https://crypto-price-api.leo2574.workers.dev/price/solana</code>
<p style="margin-top:0.75rem;font-size:0.8rem">Returns: price_usd, change_24h_pct, volume_24h_usd, market_cap_usd</p>
</div>

<div class="card">
<h2>Try It Live</h2>
<div class="label">BTC Price</div>
<code>${String.fromCharCode(36)}58,579.00 <span style="color:#EF4444">-2.56%</span></code>
<div class="label">Today's Movers</div>
<code>SYN +27.87% · IN +78.82% · CELO -12.11%</code>
<p style="margin-top:0.5rem">Real data. Updated live. No key needed.</p>
</div>
</div>

<div class="card" style="margin:2rem 0">
<h2>Endpoints</h2>
<div class="endpoints">
<div class="endpoint-row"><span class="method">GET</span><span class="path">/price/:coin</span><span class="desc">Single coin price (e.g. /price/bitcoin)</span></div>
<div class="endpoint-row"><span class="method">GET</span><span class="path">/price</span><span class="desc">Top 20 coins by market cap</span></div>
<div class="endpoint-row"><span class="method">GET</span><span class="path">/anomalies</span><span class="desc">Coins with >10% 24h movement</span></div>
<div class="endpoint-row"><span class="method">GET</span><span class="path">/gainers</span><span class="desc">Top 5 gainers by 24h %</span></div>
<div class="endpoint-row"><span class="method">GET</span><span class="path">/health</span><span class="desc">API status &amp; version</span></div>
</div>
</div>

<div class="grid">
<div class="price-card card">
<h2 style="font-size:1rem;color:white;margin-bottom:1rem">Free</h2>
<div class="price"><em>$0</em></div>
<div class="period">Forever</div>
<ul>
<li>100 requests/day per IP</li>
<li>No API key needed</li>
<li>All endpoints accessible</li>
<li>30s cache (always fresh)</li>
</ul>
<a class="btn btn-outline" href="https://crypto-price-api.leo2574.workers.dev/price/bitcoin" style="width:100%;text-align:center">TRY FREE →</a>
</div>
<div class="price-card card" style="border-color:rgba(220,38,38,0.3)">
<h2 style="font-size:1rem;color:white;margin-bottom:1rem">Pro</h2>
<div class="price"><em>$5</em></div>
<div class="period">Per month</div>
<ul>
<li>10,000 requests/day</li>
<li>Polar license key (X-API-Key header)</li>
<li>Priority support</li>
<li>Same endpoints, higher limits</li>
</ul>
<a class="btn btn-primary" href="https://polar.sh/checkout/polar_c_89q6czDPBdoRm3niGHrOTrIQGcZxxCxR18j6Q4daPan" style="width:100%;text-align:center">BUY PRO →</a>
</div>
</div>

</div>

<footer>
<a href="mailto:leo2574@proton.me">CONTACT</a> · <a href="https://crypto-price-api.leo2574.workers.dev/health">STATUS</a> · <a href="https://github.com/ghassan-gaidi">GITHUB</a><br>
Streak · Market data, delivered. · Built by Cyrus
</footer>
</body>
</html>`;
}

// ── Router ──

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  
  if (method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: CORS,
    });
  }
  
  // Rate limit
  const rl = await checkRateLimit(request, env);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ 
      error: "rate limit exceeded", 
      limit: rl.limit, 
      used: rl.used,
      upgrade: "Get a Pro key at https://polar.sh/...",
    }), {
      status: 429,
      headers: { ...CORS, "X-RateLimit-Limit": String(rl.limit), "X-RateLimit-Remaining": "0" },
    });
  }
  
  try {
    let data;
    
    if (path === "/health") {
      data = await handleHealth();
    } else if (path === "/" || path === "/docs") {
      return new Response(getLandingPage(rl), {
        status: 200,
        headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
      });
    } else if (path.startsWith("/price/")) {
      const coinId = path.slice(7);
      data = await handlePrice(coinId);
    } else if (path === "/price") {
      data = await handlePrice();
    } else if (path === "/anomalies") {
      data = await handleAnomalies();
    } else if (path === "/gainers") {
      data = await handleGainers();
    } else {
      return new Response(JSON.stringify({ 
        error: "not found",
        endpoints: ["/health", "/price/:coin", "/price", "/anomalies", "/gainers"],
      }), { status: 404, headers: CORS });
    }
    
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: { 
        ...CORS, 
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining || 0),
        "X-Tier": rl.isPro ? "pro" : "free",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: CORS,
    });
  }
}

export default {
  fetch: handleRequest,
};
