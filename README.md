# HN Telegram Bot

HN Telegram Bot is a Cloudflare Worker that automatically fetches daily Top 10 Hacker News stories and sends them to your Telegram group with keyword extraction.

## Languages

Default: English 🇺🇸  
🇺🇸 [English Documentation](README.md) | 🇨🇳 [中文文档](i18n/README.zh-CN.md)

## Features

- Fetches daily Top 10 Hacker News stories by score
- Bot commands: `/top10`, `/top20`, `/top30` for on-demand stories
- 2-hour cache for command results
- Stories sorted by points (descending)
- Extracts 10 keywords from each article (local extraction, no AI API)
- Sends formatted messages to Telegram with emojis and Markdown
- Deduplication using Cloudflare KV (7-day TTL)
- Cron trigger runs daily at 10:30 AM Beijing Time

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
| `/top10` | Get top 1-10 HN stories (sorted by points) |
| `/top20` | Get top 11-20 HN stories (sorted by points) |
| `/top30` | Get top 21-30 HN stories (sorted by points) |

Command results are cached for 2 hours.

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
│   ├── keywords.ts       # Keyword extraction
│   ├── telegram.ts       # Telegram Bot API client
│   ├── formatters.ts     # Message formatting
│   ├── config.ts         # Environment config
│   └── types.ts          # TypeScript types
├── wrangler.toml         # Cloudflare config
├── sync.sh               # Quick deploy script
└── deploy.sh             # Full deployment script
```

## How It Works

### Scheduled Digest

1. Cron trigger runs daily at 10:30 AM Beijing Time
2. Fetch top stories from HN Firebase API
3. Check KV to skip already-sent stories
4. Extract keywords from article content
5. Send formatted message to Telegram

### Bot Commands

1. Webhook receives command from Telegram
2. Check cache (2-hour TTL)
3. If cache miss: fetch, process, sort by points
4. Send formatted message

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
