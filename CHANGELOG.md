# Changelog

## [2026-02-23] - Latest Update

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

## Commands
- `/top10hn` - HN Top 10 (official ranking)
- `/top10ars` - Ars Technica Top 10
- `/btc` - Crypto prices
- `/exrate` - Exchange rates
- `/flushcache` - Clear cache
