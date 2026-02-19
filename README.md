# HN & Ars Technica Telegram Bot

A Cloudflare Worker that automatically fetches daily Top 10 Hacker News stories and Ars Technica articles, sending them to your Telegram group with keyword extraction and article summaries.

## Languages

Default: English 🇺🇸  
🇺🇸 [English Documentation](README.md) | 🇨🇳 [中文文档](i18n/README.zh-CN.md)

## Features

- **Hacker News**: Fetches Top 10 stories sorted by points
- **Ars Technica**: Fetches Top 10 articles from RSS feed with excerpts
- **Bot Commands**: On-demand stories via Telegram commands
- **Smart Caching**: 2-hour cache for command results, 1-hour for Ars RSS
- **Keyword Extraction**: Extracts 10 keywords from each HN article with stemming (local, no AI API)
- **Message Formatting**: Formatted messages with emojis and Markdown
- **Deduplication**: Uses Cloudflare KV (7-day TTL) for HN stories
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
| `/top10hn` | Get top 10 Hacker News stories (sorted by points) |
| `/top10ars` | Get top 10 Ars Technica articles (with excerpts and dates) |
| `/btc` | Get crypto prices (BTC, ETH, BNB, SOL, TON, DOT, LINK, AVAX) |
| `/flushcache` | Clear all cached data |
| `/exrate` | Get USD exchange rates (PHP, MYR, TWD, HKD, CNY, THB, VND) |

Command results are cached:
- Hacker News: 2 hours
- Ars Technica: 1 hour

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
│   ├── ars-api.ts        # Ars Technica RSS client
│   ├── keywords.ts       # Keyword extraction
│   ├── telegram.ts       # Telegram Bot API client
│   ├── formatters.ts     # Message formatting
│   ├── crypto.ts         # Crypto price fetching
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
| Hacker News | JSON API | `https://hacker-news.firebaseio.com/v0/` |
| Ars Technica | RSS Feed | `https://arstechnica.com/feed/` |
| Crypto Prices | API | CoinGecko |

## How It Works

### Scheduled Digest

1. Cron trigger runs daily at 10:30 AM Beijing Time
2. Fetch top stories from HN Firebase API
3. Check KV to skip already-sent stories
4. Extract keywords from article content
5. Send formatted message to Telegram

### Bot Commands

1. Webhook receives command from Telegram
2. Check cache (1-2 hour TTL depending on source)
3. If cache miss: fetch, process, format
4. Send formatted message

### Ars Technica Output Format

```
📰 *Ars Technica Top 10*

1. [Article Title](URL)
   📝 Article excerpt...
   📅 Feb 18, 14:30

2. [Article Title](URL)
   📝 Article excerpt...
   📅 Feb 18, 13:15
```

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
