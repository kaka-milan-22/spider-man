# Hacker News Telegram Bot

A Cloudflare Worker that automatically fetches daily Top 10 Hacker News stories and sends them to your Telegram group with keyword extraction.

## Features

- Fetches daily Top 10 Hacker News stories by score
- Bot commands: `/top10`, `/top20`, `/top30` for on-demand stories
- 2-hour cache for command results
- Stories sorted by points (descending)
- Extracts 10 keywords from each article (local extraction, no AI API)
- Sends formatted messages to Telegram with emojis and Markdown
- Deduplication using Cloudflare KV (7-day TTL)
- Cron trigger runs daily at 10:30 AM Beijing Time

## Quick Start

```bash
npm install
npm run setup      # Create KV, configure secrets
npm run deploy     # Deploy to Cloudflare
npm run trigger    # Test the bot
```

## Prerequisites

Before you begin, you'll need:

1. **Node.js** (v18 or later)
2. **Cloudflare Account** - [Sign up here](https://dash.cloudflare.com/sign-up)
3. **Telegram Bot Token** - Get from [@BotFather](https://t.me/botfather)
4. **Telegram Chat ID** - The group/chat where messages will be sent

## Setup Guide

### Step 1: Create Your Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Save your **bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 2: Get Your Telegram Chat ID

**For Groups:**
1. Add your bot to the group
2. Send a message in the group
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for `"chat":{"id":-123456789` - that's your chat ID (negative number for groups)

**For Personal Chat:**
1. Send a message to your bot
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for `"chat":{"id":123456789` - that's your chat ID

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Wrangler

1. Copy the example config:
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Create KV namespace:
   ```bash
   npm run kv:create
   ```
   
   This will output something like:
   ```
   Created namespace: HN_STORIES
   id: abc123def456...
   ```

4. Update `wrangler.toml` with your KV namespace IDs:
   ```toml
   [[kv_namespaces]]
   binding = "HN_STORIES"
   id = "your-kv-namespace-id-here"
   preview_id = "your-preview-kv-namespace-id-here"
   ```

### Step 5: Set Secrets

```bash
# Set Telegram Bot Token
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Enter your bot token when prompted

# Set Telegram Chat ID
npx wrangler secret put TELEGRAM_CHAT_ID
# Enter your chat ID when prompted
```

### Step 6: Deploy

```bash
npm run deploy
```

### Step 7: Set Webhook

After deployment, set the webhook for your bot:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-worker.workers.dev/webhook"}'
```

### Step 8: Test

```bash
npm run trigger
```

You should receive a message in your Telegram group with the top Hacker News stories!

## Bot Commands

Send these commands in your Telegram group:

| Command | Description |
|---------|-------------|
| `/top10` | Get top 1-10 HN stories (sorted by points) |
| `/top20` | Get top 11-20 HN stories (sorted by points) |
| `/top30` | Get top 21-30 HN stories (sorted by points) |

Command results are cached for 2 hours.

## Available Commands

### npm Scripts

```bash
npm run dev         # Local development
npm run deploy      # Deploy to Cloudflare
npm run logs        # View real-time logs
npm run trigger     # Manually trigger the bot
npm run setup       # First-time setup
npm run kv:create   # Create KV namespace
npm run secrets     # Show secrets setup instructions
npm run typecheck   # Run TypeScript check
```

### Shell Scripts

```bash
./sync.sh           # TypeScript check + deploy to Cloudflare
./deploy.sh         # Full deployment script with checks
```

### Make Commands

```bash
make dev            # Local development
make deploy         # Deploy to Cloudflare
make setup          # Create KV namespace
make secrets        # Set secrets
make logs           # View logs
make test           # Manual trigger
make check          # TypeScript check
make release        # Deploy + test
```

## Project Structure

```
hn-telegram-bot/
├── src/
│   ├── index.ts          # Main Worker handler with cron
│   ├── hn-api.ts         # Hacker News API client
│   ├── keywords.ts       # Keyword extraction module
│   ├── telegram.ts       # Telegram Bot API client
│   ├── formatters.ts     # Message formatting
│   ├── config.ts         # Environment config
│   └── types.ts          # TypeScript types
├── wrangler.toml         # Cloudflare configuration
├── wrangler.toml.example # Config template
├── package.json          # Dependencies & scripts
├── tsconfig.json         # TypeScript config
├── Makefile              # Quick commands
├── deploy.sh             # Deployment script
├── sync.sh               # Quick sync script
├── .dev.vars.example     # Local env template
└── README.md             # This file
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Your Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Yes | Target Telegram chat/group ID |
| `HN_TOP_N` | No | Number of stories to fetch (default: 10) |

### Cron Schedule

Default: Daily at 10:30 AM Beijing Time (02:30 UTC)

Edit `wrangler.toml` to change:
```toml
[triggers]
crons = ["30 2 * * *"]  # UTC time
```

Cron format: `min hour day month weekday`

Examples:
- `30 2 * * *` - Daily at 10:30 AM Beijing Time
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - Every Monday at 9:00 AM UTC

### Customization

**Change number of stories:**

Edit `wrangler.toml`:
```toml
[vars]
HN_TOP_N = "20"  # Fetch top 20 stories
```

Or set as secret:
```bash
npx wrangler secret put HN_TOP_N
```

## Troubleshooting

### "TELEGRAM_BOT_TOKEN is required" error

You need to set your secrets:
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### Bot not sending messages

1. Check logs: `npm run logs`
2. Verify bot token is correct
3. Make sure bot is added to the group (for group chats)
4. Check chat ID is correct (negative for groups)

### Bot commands not working

1. Make sure webhook is set correctly
2. Check webhook status: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
3. Verify the worker URL is correct

### "KV namespace not found" error

Create the KV namespace and update wrangler.toml:
```bash
npm run kv:create
```

Then copy the ID to your `wrangler.toml` file.

### Deployment fails

1. Make sure you're logged in: `npx wrangler login`
2. Check wrangler.toml exists and has valid config
3. Run TypeScript check: `npm run typecheck`

### Messages not formatted correctly

The bot uses Markdown format. If you see raw Markdown syntax:
1. Make sure `parse_mode: 'Markdown'` is set
2. Check the title doesn't contain special characters that break Markdown

## Development

### Local Development

```bash
npm run dev
```

This starts a local server. You can test endpoints:
- `http://localhost:8787/health` - Health check
- `http://localhost:8787/trigger` - Manually trigger the bot

### Testing

```bash
# Type check
npm run typecheck

# Manual trigger
npm run trigger

# View logs
npm run logs
```

## How It Works

1. **Cron Trigger**: Runs daily at scheduled time (10:30 AM Beijing)
2. **Fetch Stories**: Gets top stories from HN Firebase API
3. **Deduplication**: Checks KV to skip already-sent stories
4. **Keyword Extraction**: Fetches article content and extracts top 10 keywords using word frequency
5. **Formatting**: Formats message with emojis and Markdown
6. **Telegram**: Sends formatted message to your group

For bot commands:
1. **Webhook**: Receives command from Telegram
2. **Cache Check**: Returns cached result if available (2-hour TTL)
3. **Fetch & Process**: Gets stories and extracts keywords
4. **Sort**: Orders stories by points (descending)
5. **Send**: Delivers formatted message to chat

## License

ISC

## Contributing

Pull requests welcome! Please ensure:
1. TypeScript compiles without errors (`npm run typecheck`)
2. Code follows existing patterns
3. Add tests if applicable

## Support

If you encounter issues:
1. Check the logs: `npm run logs`
2. Review this README
3. Open an issue with details
