# HN & Ars Technica Telegram Bot

A Cloudflare Worker that automatically fetches daily Top 10 Hacker News stories and Ars Technica articles, sending them to your Telegram group.

## Languages

Default: English 🇺🇸  
🇺🇸 [English Documentation](README.md) | 🇨🇳 [中文文档](i18n/README.zh-CN.md)

## Features

- **Hacker News**: Fetches Top 10 stories using HN's official ranking algorithm (considers time, points, and comments)
- **Ars Technica**: Fetches Top 10 articles from RSS feed with excerpts
- **ETH Daily Brief**: On-demand `/eth` brief — ETH/BTC price, DeFi TVL, top 5 protocols, top 4 stablecoins, DEX volume (CoinGecko + DeFiLlama)
- **Exchange Rates**: Get USD exchange rates (PHP, MYR, TWD, HKD, CNY, THB, VND)
- **Bot Commands**: On-demand stories via Telegram commands
- **Smart Caching**: 1-hour KV cache for HN, Ars Technica, and exchange rates
- **HTML Formatting**: Robust message formatting using HTML (more reliable than Markdown)
- **Error Reporting**: Command failures are reported back to the user with the reason
- **Cron Trigger**: Runs daily at 10:30 AM Beijing Time

## Requirements

- Node.js 18+
- Cloudflare Account
- Telegram Bot Token (from @BotFather)
- Telegram Chat ID

## Install

```bash
npm install
```

## Quick Start

### 1. Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Save your bot token

### 2. Get Chat ID

1. Add bot to your group
2. Send a message in the group
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id":-123456789` (negative for groups)

### 3. Configure Wrangler

```bash
# Copy example config
cp wrangler.toml.example wrangler.toml

# Login to Cloudflare
npx wrangler login

# Create KV namespace
npm run kv:create
```

Update `wrangler.toml` with your KV namespace ID.

### 4. Set Secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### 5. Deploy

```bash
npm run deploy
```

### 6. Set Webhook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-worker.workers.dev/webhook"}'
```

### 7. Test

```bash
npm run trigger
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/top10hn` | Get top 10 Hacker News stories (HN official ranking: considers time, points, comments) |
| `/top10ars` | Get top 10 Ars Technica articles (with excerpts and dates) |
| `/btc` | Get crypto prices (BTC, ETH, BNB, SOL, TON, DOT, LINK, AVAX) |
| `/eth` | ETH daily brief: ETH/BTC price, DeFi TVL, top 5 ETH protocols, top 4 stablecoins, DEX 24h/7d volume |
| `/exrate` | Get USD exchange rates (PHP, MYR, TWD, HKD, CNY, THB, VND) |
| `/flushcache` | Clear all cached data |

Command results are cached for 1 hour (HN, Ars Technica, and exchange rates).

## CLI Commands

```bash
npm run dev         # Local development
npm run deploy      # Deploy to Cloudflare
npm run logs        # View real-time logs
npm run trigger     # Manually trigger the bot
npm run typecheck   # Run TypeScript check
./sync.sh           # TypeScript check + deploy
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Yes | Target chat/group ID |
| `HN_TOP_N` | No | Number of stories (default: 10) |

### Cron Schedule

Default: Daily at 10:30 AM Beijing Time (02:30 UTC)

Edit `wrangler.toml`:
```toml
[triggers]
crons = ["30 2 * * *"]
```

## Project Structure

```
hn-telegram-bot/
├── src/
│   ├── index.ts          # Main Worker handler
│   ├── hn-api.ts         # Hacker News API client
│   ├── ars-api.ts        # Ars Technica RSS client (with KV cache)
│   ├── telegram.ts       # Telegram Bot API client
│   ├── formatters.ts     # Message formatting (HTML)
│   ├── crypto.ts         # Crypto price fetching
│   ├── eth-brief.ts      # ETH daily brief (CoinGecko + DeFiLlama)
│   ├── exrate-api.ts     # Exchange rate API
│   ├── config.ts         # Environment config
│   └── types.ts          # TypeScript types
├── wrangler.toml         # Cloudflare config
├── commands.txt          # Bot commands reference
├── sync.sh               # Quick deploy script
└── deploy.sh             # Full deployment script
```

## Data Sources

| Source | Type | URL |
|--------|------|-----|
| Hacker News | JSON API | `https://hacker-news.firebaseio.com/v0/topstories.json` |
| Ars Technica | RSS Feed | `https://arstechnica.com/feed/` |
| Crypto Prices | API | CoinGecko |
| ETH DeFi Data | API | DeFiLlama |
| Exchange Rates | API | currencyapi.com |

## Ranking Algorithm

### Hacker News Ranking

`/top10hn` uses **HN's official ranking algorithm** (not simple score sorting).

The ranking considers:
- **Points**: Upvote count
- **Time**: Freshness (newer is better)
- **Comments**: Engagement level
- **Time Decay**: Score decreases over time

Formula (simplified):
```
Ranking Score = (Points - 1) / (Age + 2)^Gravity
```

**Why HN's algorithm?**
- ✅ Balances freshness and popularity
- ✅ Matches HN homepage order
- ✅ Reflects current community interest
- ✅ Prevents old posts from dominating

### Example Comparison

**Pure score sorting** (old behavior):
```
1. Article A - 1500 points (3 days ago)
2. Article B - 1200 points (2 days ago)
3. Article C - 800 points (1 hour ago)  ← Latest but ranked 3rd
```

**HN's algorithm** (current behavior):
```
1. Article C - 800 points (1 hour ago)   ← Hot and fresh
2. Article D - 600 points (3 hours ago)
3. Article A - 1500 points (3 days ago)  ← High score but outdated
```

## How It Works

### Scheduled Digest

1. Cron trigger runs daily at 10:30 AM Beijing Time
2. Fetch top 10 stories from HN API (same as `/top10hn`)
3. Send formatted digest to Telegram

### Bot Commands

1. Webhook receives command from Telegram
2. Check KV cache (1-hour TTL)
3. If cache miss: fetch, format, cache, send
4. On any error: send failure reason back to user

### Ars Technica Output Format

```
📰 Ars Technica Top 10

1. Article Title (linked)
   📝 Article excerpt...
   📅 Feb 18, 14:30

2. Article Title (linked)
   📝 Article excerpt...
   📅 Feb 18, 13:15
```

### Message Format

All messages use **HTML formatting** for better stability:
- Links: `<a href="url">text</a>`
- Bold: `<b>text</b>`
- Italic: `<i>text</i>`
- Code: `<code>text</code>`

HTML is more reliable than Markdown for handling special characters in titles.

## Troubleshooting

### Bot not responding to commands

1. Check webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
2. Verify worker URL is correct
3. Check logs: `npm run logs`

### Bot not sending daily messages

1. Check cron schedule in `wrangler.toml`
2. Verify secrets are set correctly
3. Run manual trigger: `npm run trigger`

## License

[ISC](https://choosealicense.com/licenses/isc/)
