# Changelog

## [2026-10-18]

### Added

- `/stocks`: ten US-listed stocks and ETFs, including Meta and Alphabet.
- `/oil`: Brent and WTI futures plus weekly Metro Manila / NCR fuel reference prices.
- `/market`: major indices, DXY, US 10Y yield and VIX, with a mobile-friendly layout.
- `/calendar [days]`: Federal Reserve, BLS and EIA events, displayed in UTC+8.
- Owner-only `/status`: recent data-source results and live Telegram webhook diagnostics.
- Offline regression tests for access control, quotes, exchange rates, calendars and diagnostics.

### Changed

- Commands are limited to the configured Telegram group. `/flushcache` and `/status` require the current group owner and appear only in the owner's command menu.
- Webhook and manual trigger requests require the Telegram webhook secret; Worker version preview URLs are disabled.
- Stock, oil, market and calendar requests fetch upstream data without an application cache. Source timestamps, units and partial failures are shown explicitly.
- Link previews are disabled for oil and calendar source links. Market entries use separate name, value and timestamp lines with blank lines between entries.
- English and Chinese documentation now covers all commands, permissions, data sources, cache behavior, deployment and troubleshooting.
- Deployment helpers validate TypeScript and run regression tests before deployment; KV setup uses current Wrangler command syntax.
- The existing daily Hacker News schedule remains the only cron job. No `/alert` command or background polling was added.

### Fixed

- `/exrate` now accepts flat and nested cached rate records, validates all required currencies and avoids calling `toFixed` on missing values.
- Invalid exchange-rate responses are rejected instead of caching zero values.
- Market output distinguishes US 10Y percentage yields and basis-point changes, ETF share prices and crude futures prices.

## [2026-02-23]

### 📝 Changed
- **Cache TTL Extended to 2 Hours**: `/top10hn`, `/top10ars`, `/exrate`, `/eth` commands now cache results for 2 hours (was 1 hour)
  - Reduces upstream API calls
  - More stable response times

## [2026-02-20] - Previous Update

### ✨ Added
- **Exchange Rates Caching**: `/exrate` command now uses 1-hour KV cache
  - Reduces API calls to currencyapi.com
  - Faster response times for repeated requests
  - Fallback to cached data on API errors

## [2026-02-19] - Previous Update

### 🔧 Fixed
- **Telegram Markdown Parsing Error**: Switched from Markdown to HTML formatting
  - Fixes "can't parse entities" error
  - Better handling of special characters (`:`, `-`, `'`, etc.)
  - More stable message rendering

### ✨ Added
- **HN Official Ranking Algorithm**: Now uses HN's ranking formula instead of pure score sorting
  - Considers time decay, engagement, and freshness
  - Matches news.ycombinator.com homepage order
  - Shows hot and fresh content, not just high-scoring old posts
- **Crypto Prices Command** (`/btc`): Get real-time cryptocurrency prices
- **Exchange Rates Command** (`/exrate`): Get USD exchange rates

### 📝 Changed
- Message formatting changed from Markdown to HTML
  - Links: `[text](url)` → `<a href="url">text</a>`
  - Bold: `*text*` → `<b>text</b>`
  - Italic: `_text_` → `<i>text</i>`
- Ranking algorithm: Pure score sorting → HN official algorithm
- Updated documentation (English and Chinese)

### 🚀 Deployment
- Version ID: 60fa3aa4-d99e-4e80-a91d-0fb83f10b022
- Worker URL: https://hn-telegram-bot.kakacn.workers.dev
- Webhook: https://hn-telegram-bot.kakacn.workers.dev/webhook

See the [current command reference](README.md#commands) for the complete list and access requirements.
