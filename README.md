# Spider-Man Telegram Bot

A TypeScript Cloudflare Worker for group news, market quotes and economic calendars.
It sends a Hacker News digest daily at **10:30 UTC+8**; all other features are requested through Telegram commands.

[English](README.md) · [简体中文](i18n/README.zh-CN.md) · [Changelog](CHANGELOG.md)

## Commands

Public commands work for every member of the configured group. Commands from other groups and private chats are ignored.

| Command | Result | Application cache |
| --- | --- | --- |
| `/top10hn` | Top 10 valid stories in the order supplied by Hacker News | 2 hours |
| `/top10ars` | Latest 10 Ars Technica RSS articles, with excerpts and dates | 2 hours |
| `/btc` | Coinbase USD quotes and 24-hour changes; unavailable pairs are omitted | None |
| `/stocks` | Nine US-listed stocks and one gold ETF, with daily changes | None |
| `/oil` | Brent/WTI Futures and Metro Manila gasoline/Diesel reference prices | None |
| `/market` | S&P 500, Nasdaq Composite, DXY, US 10Y Treasury yield and VIX | None |
| `/calendar` | Official FOMC, CPI, Employment Situation and EIA releases over the next 7 days | None |
| `/calendar 30` | The same calendar over the next 30 days | None |
| `/eth` | ETH/BTC prices, Ethereum DeFi TVL, protocols, stablecoins and DEX volume | 2 hours |
| `/exrate` | USD exchange rates for PHP, MYR, TWD, HKD, CNY, THB and VND | 2 hours |
| `/status` | Recent source results, request duration, last success and live Webhook status | Owner only |
| `/flushcache` | Clear every key in the bound KV namespace, including status records | Owner only |

`/btc` requests BTC, ETH, BNB, SOL, TON, DOT, LINK, AVAX, UNI and AAVE; upstream availability determines which pairs appear.
`/alert` is not implemented, and there is no background market polling.

## Quotes and display

### Stocks and gold

`/stocks` uses Yahoo Finance and keeps the compact `/btc` layout.

| Symbol | Instrument |
| --- | --- |
| AAPL | Apple |
| NVDA | NVIDIA |
| TSLA | Tesla |
| TSM | Taiwan Semiconductor Manufacturing Company US ADR |
| AMZN | Amazon; represents the parent company of AWS |
| MSFT | Microsoft |
| GLD | SPDR Gold Shares ETF; USD per share, not spot gold per ounce |
| NET | Cloudflare |
| META | Meta Platforms |
| GOOGL | Alphabet Class A |

Quotes use the regular trading session, including the most recent session when the market is closed.
Changes are relative to the previous session's close. The footer shows the source quote time in UTC+8.

### International oil and Philippine fuel

`/oil` shows Brent (`BZ=F`) and WTI (`CL=F`) Futures in **USD/barrel**, then Metro Manila / NCR averages for **Unleaded 91** and **Diesel** in **PHP/liter**.
Unleaded 91 is RON 91 unleaded gasoline. Philippine figures come from [GasWatch PH](https://gaswatchph.com/), which aggregates DOE advisories and community reports.
They are weekly regional reference prices; individual stations can charge different amounts.
The publication date is shown, with a warning when it is at least 14 days old. The source link remains clickable, with its Telegram preview disabled.

### Market overview

`/market` uses `^GSPC`, `^IXIC`, `DX-Y.NYB`, `^TNX` and `^VIX`.
Index values are points, not USD amounts. Yahoo's `^TNX` already represents a percentage; its change is displayed in basis points (**1 bp = 0.01 percentage point**).

The mobile layout uses three lines per instrument: a bold name, value plus change, then the source timestamp. Groups are separated by a blank line; UTC+8 is stated once at the top. Values are not padded into wide columns.

Illustrative output, not a live quote:

```text
🌐 市场概览
报价时间：UTC+8

S&P 500
6,000.00  🔴 -1.00%
2026-10-17 04:00

US 10Y
4.250%  🟢 +2.0 bp
2026-10-17 03:00
```

`/stocks`, `/oil`, `/market` and `/calendar` make fresh requests with `cache: 'no-store'` and do not fall back to cached prices or calendars.
They identify unavailable sources while preserving successful results. Fresh requests do not remove upstream delays or turn weekly publications into live data.
The Wrangler `cache_option_enabled` flag enables this fetch option with the project's compatibility date.

## Economic calendar

`/calendar` defaults to the next 7 days; `/calendar 7` and `/calendar 30` are also accepted.
It fetches the [Fed meeting calendar](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm), [BLS ICS schedule](https://www.bls.gov/schedule/news_release/bls.ics) and [EIA release schedule](https://www.eia.gov/petroleum/supply/weekly/schedule.php) on each request.

US Eastern times are converted through the IANA `America/New_York` timezone into UTC+8, including DST and date rollover.
EIA holiday exceptions replace ordinary Wednesday releases. FOMC dates use the final meeting day; the customary 14:00 ET release time is marked as an assumption subject to official changes.
Unavailable sources, changed formats or calendars that do not cover the requested period produce an incomplete-data notice. They are never treated as proof that no events are scheduled.
Calendar source links have previews disabled.

## Access control and diagnostics

`TELEGRAM_CHAT_ID` is both the scheduled destination and the only group allowed to execute commands. No member-by-member allowlist is needed.
For `/status` and `/flushcache`, the Worker asks Telegram for the current group owner (`creator`) on every invocation. Ordinary administrators, former owners and anonymous senders are denied silently; failed owner lookup also denies access.
Anonymous administrators must switch to their personal identity to use these commands.

The setup script hides owner commands from public and administrator menus, adding them to the owner's `chat_member` menu only.
Menu visibility does not grant permission or hide messages already posted in the group. After an ownership transfer, rerun setup; if the former owner is no longer an administrator, also remove their old custom menu scope. Telegram cannot enumerate all historical user/language scopes.

`/status` reports observations from actual command calls, not continuous health probes. It queries Telegram Webhook status live.
Only result metadata, duration and last successful call time are stored under `status:v1:*`, for up to 30 days. Quote payloads, credentials and raw exception text are not stored in these records.
KV can lag under concurrent use. Cache-based results are labelled: a cache hit is not an upstream health check. Commands show “no record” until used; `/flushcache` resets the records.

| Endpoint | Access |
| --- | --- |
| `GET /health` | Public health response |
| `POST /webhook` | Requires `X-Telegram-Bot-Api-Secret-Token` |
| `POST /trigger` | Same secret; sends the HN digest to the configured group |

An absent or incorrect secret rejects the protected HTTP request. Cron runs internally without this header.
Version preview URLs are disabled with `preview_urls = false` so older versions cannot provide an alternative unprotected entry point.

## Setup and deployment

Use Node.js 20+ compatible with your installed Wrangler version, npm, a Cloudflare account and a Telegram bot created through [@BotFather](https://t.me/botfather).
Add the bot to the target group and obtain its numeric group ID. For a new bot without a registered Webhook, the Telegram `getUpdates` API can identify it after a group command is sent. Keep bot tokens out of browser URLs and logs.

For a **new installation**, copy `wrangler.toml.example` to `wrangler.toml`; preserve the existing configuration when updating a deployed bot.
Set your Worker name, Cloudflare `account_id` if needed, and KV binding ID. Use a separate preview KV namespace for development.

```bash
npm install
npx wrangler login
npm run kv:create
npx wrangler kv namespace create HN_STORIES --preview
```

Create the Worker with `npm run deploy` if it does not yet exist, then store its secrets through Wrangler:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Required only for /exrate:
npx wrangler secret put CURRENCY_API_KEY
```

Use a random 32–256-character Webhook secret containing letters, digits, underscores or hyphens.
Inject the same `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TELEGRAM_WEBHOOK_SECRET` into the setup process using your secret manager, then run:

```bash
npm run telegram:setup
```

For a new bot, also supply `TELEGRAM_WEBHOOK_URL=https://your-worker.workers.dev/webhook` in that environment.
Otherwise the setup script reuses the current Webhook URL. It reads no local secret files and prints no credentials.
It configures the authenticated Webhook and the default, English and Chinese menus. Add other existing menu languages via `TELEGRAM_COMMAND_LANGUAGES` (comma-separated two-letter codes).

To upgrade an older deployment without Webhook authentication: store the shared secret and run setup before deploying the protected handler.
For later updates, validate and deploy code, then rerun menu setup whenever commands change:

```bash
npm run typecheck
npm test
npm run deploy
npm run telegram:setup
```

The tests run offline against the real TypeScript modules with mocked upstream APIs; they do not send Telegram messages or access Cloudflare credentials.
Production smoke checks can start with `/health`, followed by the relevant commands in the configured group.

### Configuration reference

| Setting | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Worker Secret and setup-process environment variable |
| `TELEGRAM_CHAT_ID` | Numeric allowed group ID, stored as a Worker Secret and supplied to setup |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret for Webhook and manual trigger authentication |
| `CURRENCY_API_KEY` | currencyapi.com key required for `/exrate` |
| `TELEGRAM_WEBHOOK_URL` | Setup-only URL; required when no Webhook exists |
| `TELEGRAM_COMMAND_LANGUAGES` | Setup-only additional menu languages |
| `HN_TOP_N` | Retained configuration value; current digest and HN command fetch the top 10 |

The only cron remains the daily HN digest:

```toml
[triggers]
crons = ["30 2 * * *"] # 10:30 UTC+8
```

### Local commands

```bash
npm run dev             # Local Worker server
npm run test:scheduled  # Local server exposing /__scheduled for cron testing
npm run typecheck       # TypeScript validation
npm test                # Offline regression tests
npm run logs            # Live Worker logs; treat request headers as sensitive
npm run deploy          # Deploy Worker code and configured cron
npm run telegram:setup  # Configure Webhook and command menus
```

`npm run trigger` is an alias for scheduled local development; it does not invoke production.
`sync.sh` validates and deploys, and `deploy.sh` installs dependencies, validates and deploys. Neither runs menu setup automatically because it requires the setup-process credentials.

## Data sources and code

| Feature | Source | Main module |
| --- | --- | --- |
| Hacker News | Firebase HN API; retains supplied ranking order | `src/hn-api.ts` |
| Ars Technica | Ars Technica RSS | `src/ars-api.ts` |
| Crypto quotes | Coinbase Exchange product stats | `src/crypto.ts` |
| Stocks, oil Futures, market indices | Yahoo Finance chart API | `src/yahoo-finance.ts`, `stocks.ts`, `oil.ts`, `market.ts` |
| Philippine fuel | GasWatch PH published Metro Manila averages | `src/oil.ts` |
| ETH brief | Coinbase prices, optional CoinGecko market caps, DeFiLlama | `src/eth-brief.ts` |
| USD exchange rates | currencyapi.com | `src/exrate-api.ts` |
| Economic calendar | Federal Reserve, BLS, EIA | `src/calendar.ts` |
| Diagnostics | Command observations and Telegram Webhook API | `src/monitoring.ts` |

`src/index.ts` routes commands and cron. `src/access.ts` verifies Webhook and group access; `src/telegram.ts` handles Telegram and owner lookup; `src/display.ts` provides formatting helpers.
`scripts/setup-telegram.mjs` registers menus and Webhook authentication. `tests/` covers source parsing, partial failures, cache compatibility, permissions and formatting.
`commands.txt` lists public commands; setup adds the two owner-only commands separately.

## Troubleshooting

**No reply:** use the configured group, check `/status` as owner, then inspect `npm run logs`. With Telegram privacy mode or multiple bots, address the command explicitly as `/market@YourBotUsername`. Check that the Webhook points to `/webhook` and uses the same secret as the Worker. Test `/health` for basic reachability.

**Owner command missing:** run setup with the current group credentials and relevant menu languages. Use your personal identity, not anonymous administrator mode. Manually typing a command does not bypass its owner check.

**Old timestamps or unavailable prices:** check the source timestamp and market session. No application cache does not guarantee live upstream data. Philippine fuel prices are weekly. A missing source remains unavailable rather than reusing an old quote.

**`/exrate` error:** confirm `CURRENCY_API_KEY`. The parser supports both flat and nested historical KV schemas and rejects missing/non-numeric rates before formatting.

**No daily digest:** inspect cron and Telegram delivery logs. `POST /trigger` with the shared secret triggers a real group digest; local scheduled testing does not verify production delivery.

## License

[ISC](https://choosealicense.com/licenses/isc/)
