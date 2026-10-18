# Spider-Man Telegram Bot

基于 TypeScript 和 Cloudflare Worker 的 Telegram 群组助手，提供新闻、行情、经济日程和运行状态。
每天 **10:30 UTC+8** 推送 Hacker News digest；其余功能通过命令按需查询。

[English](../README.md) · [简体中文](README.zh-CN.md) · [Changelog](../CHANGELOG.md)

## 命令

普通命令对目标群的所有成员开放。其他群和私聊中的命令会被忽略。

| 命令 | 内容 | 应用缓存 |
| --- | --- | --- |
| `/top10hn` | 按 Hacker News API 原始顺序返回 10 条有效文章 | 2 小时 |
| `/top10ars` | Ars Technica RSS 最新 10 篇文章，含摘要和时间 | 2 小时 |
| `/btc` | Coinbase 的 USD 报价与 24 小时涨跌；不可用交易对会省略 | 无 |
| `/stocks` | 10 个美股 / 黄金 ETF 的价格和日涨跌 | 无 |
| `/oil` | Brent/WTI Futures 与 Metro Manila 汽油 / Diesel 参考价 | 无 |
| `/market` | S&P 500、Nasdaq Composite、DXY、US 10Y Treasury yield、VIX | 无 |
| `/calendar` | 未来 7 天的 FOMC、CPI、非农、EIA 官方日程 | 无 |
| `/calendar 30` | 查看未来 30 天的上述日程 | 无 |
| `/eth` | ETH/BTC 价格、Ethereum DeFi TVL、protocols、stablecoins、DEX volume | 2 小时 |
| `/exrate` | USD 对 PHP、MYR、TWD、HKD、CNY、THB、VND 的汇率 | 2 小时 |
| `/status` | 最近调用结果、耗时、成功时间和实时 Webhook 状态 | 仅 owner |
| `/flushcache` | 清除绑定 KV namespace 的所有 key，包括状态记录 | 仅 owner |

`/btc` 请求 BTC、ETH、BNB、SOL、TON、DOT、LINK、AVAX、UNI、AAVE；实际返回取决于上游交易对是否可用。
当前没有 `/alert`，也没有后台行情轮询。

## 行情与布局

### 美股与黄金

`/stocks` 使用 Yahoo Finance，沿用 `/btc` 的紧凑布局。

| Symbol | 对应资产 |
| --- | --- |
| AAPL | Apple |
| NVDA | NVIDIA |
| TSLA | Tesla |
| TSM | 台积电的美股 ADR |
| AMZN | Amazon，AWS 的母公司 |
| MSFT | Microsoft |
| GLD | SPDR Gold Shares ETF；价格是 USD/股，不是现货黄金 USD/盎司 |
| NET | Cloudflare |
| META | Meta Platforms |
| GOOGL | Alphabet Class A |

返回 regular trading session 报价，休市时使用最近一次该时段的报价；涨跌相对前一交易日收盘价。
底部显示源数据的报价时间（UTC+8），不会把本次查询时间当成报价时间。

### 国际油价与菲律宾油价

`/oil` 显示 Brent（`BZ=F`）和 WTI（`CL=F`）Futures，单位 **USD/桶**；菲律宾部分显示 Metro Manila / NCR 的 **Unleaded 91** 与 **Diesel** 均价，单位 **PHP/L**。
Unleaded 91 是 RON 91 无铅汽油，Diesel 是柴油。菲律宾数据来自 [GasWatch PH](https://gaswatchph.com/)，该站汇总 DOE 公告与社区数据。
这些是每周区域参考价，各加油站实际售价可能不同。返回中标注数据日期，距今达到 14 天会提示。
来源链接可以点击，Telegram preview 已关闭。

### 市场概览

`/market` 使用 `^GSPC`、`^IXIC`、`DX-Y.NYB`、`^TNX`、`^VIX`。
指数显示点位；Yahoo 的 `^TNX` 已经是百分比，Treasury yield 的变化使用 basis points（**1 bp = 0.01 个百分点**）。

手机布局每项三行：加粗名称、数值与涨跌、源报价时间。项目之间空一行，UTC+8 只在顶部注明，不再用补空格的方式强行对齐宽列。

以下仅为布局示例，不是实时报价：

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

`/stocks`、`/oil`、`/market`、`/calendar` 每次使用 `cache: 'no-store'` 重新请求，不用旧行情或旧日程兜底。
单个来源失败会明确提示，其他结果照常返回。重新请求不代表上游没有延迟，也不代表每周发布的数据是实时价格。
Wrangler 配置中的 `cache_option_enabled` 用于在现有 compatibility date 下支持该 fetch 选项。

## 经济日程

`/calendar` 默认查询未来 7 天，也接受 `/calendar 7` 和 `/calendar 30`。
每次读取 [Fed meeting calendar](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)、[BLS ICS](https://www.bls.gov/schedule/news_release/bls.ics) 和 [EIA release schedule](https://www.eia.gov/petroleum/supply/weekly/schedule.php)。

通过 IANA `America/New_York` 时区处理美国 DST，再转换为 UTC+8，包括跨日情况。
EIA 假期调整会替代通常的周三发布时间。FOMC 使用会议最后一天，按通常 14:00 ET 发布时刻换算，并明确注明以临时公告为准。
来源不可用、页面格式变化或日程尚未覆盖查询期间时，提示数据不完整，不把失败当成“没有事件”。
日程来源链接也关闭 preview。

## 权限与诊断

`TELEGRAM_CHAT_ID` 同时指定定时推送目标和唯一允许执行命令的群，不需要逐个维护成员 allowlist。
`/status` 和 `/flushcache` 每次都通过 Telegram 查询当前群 owner（`creator`）。普通管理员、原 owner、匿名发送者均无法执行；查询失败也拒绝授权。
匿名管理员需要切换回个人身份使用这两个命令。

设置脚本从公共和管理员菜单移除 owner 命令，仅在 owner 的 `chat_member` 菜单显示。
菜单隐藏不代表权限控制，也不会隐藏已经发送到群里的消息。群主转让后需要重新运行设置脚本；如果原 owner 已经不在管理员列表中，还需删除其旧自定义菜单 scope。Telegram 无法枚举全部历史用户或语言 scope。

`/status` 展示实际命令调用记录，不主动轮询全部数据源；Webhook 状态实时查询。
仅将结果 metadata、耗时和最近成功时间写入 `status:v1:*`，最长保留 30 天；不在这些记录里保存行情内容、凭据或原始异常。
KV 在并发时可能稍有延迟。缓存命中的命令会注明，不能据此认定上游健康。未使用过的命令显示“暂无调用记录”；`/flushcache` 会重置这些记录。

| Endpoint | 访问方式 |
| --- | --- |
| `GET /health` | 公开 health response |
| `POST /webhook` | 必须携带 `X-Telegram-Bot-Api-Secret-Token` |
| `POST /trigger` | 使用相同 Secret；会向目标群发送 HN digest |

Secret 缺失或错误时拒绝受保护的 HTTP 请求。Cron 在内部执行，不使用该 header。
配置保留 `preview_urls = false`，避免旧版本通过 version preview URL 提供额外入口。

## 配置与部署

使用兼容已安装 Wrangler 版本的 Node.js 20+、npm、Cloudflare 账号，以及从 [@BotFather](https://t.me/botfather) 创建的 Telegram bot。
将 bot 加入目标群并取得数字 group ID。对于尚未注册 Webhook 的新 bot，可以在群内发命令后，通过 Telegram `getUpdates` API 获取 ID；不要把 bot token 放进浏览器 URL 或日志。

**新安装**时复制 `wrangler.toml.example` 为 `wrangler.toml`；更新已有部署时保留现有配置。
填写 Worker 名称、必要时指定 Cloudflare `account_id`，并设置 KV binding ID。开发时使用独立 preview KV namespace。

```bash
npm install
npx wrangler login
npm run kv:create
npx wrangler kv namespace create HN_STORIES --preview
```

Worker 尚不存在时先执行一次 `npm run deploy` 创建，再通过 Wrangler 保存 Secrets：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# 仅 /exrate 必需：
npx wrangler secret put CURRENCY_API_KEY
```

Webhook Secret 使用随机生成的 32–256 位字符串，仅包含字母、数字、下划线或连字符。
通过 secret manager 向设置进程注入同一组 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID` 和 `TELEGRAM_WEBHOOK_SECRET`，执行：

```bash
npm run telegram:setup
```

新 bot 还需在该进程环境中提供 `TELEGRAM_WEBHOOK_URL=https://你的worker.workers.dev/webhook`。
已有 bot 默认复用当前 Webhook URL。脚本不读取本地 secret 文件，也不输出凭据。
它会配置带验证信息的 Webhook，以及默认、English、中文菜单；其他已有菜单语言通过 `TELEGRAM_COMMAND_LANGUAGES` 补充，使用逗号分隔的两位 language code。

从没有 Webhook 鉴权的旧版本升级时，先保存 shared secret 并运行设置脚本，再部署受保护的 handler。
后续更新先验证并部署代码；命令发生变化时再次更新菜单：

```bash
npm run typecheck
npm test
npm run deploy
npm run telegram:setup
```

测试离线执行，使用实际 TypeScript 模块和 mock upstream API，不发送 Telegram 消息，也不访问 Cloudflare 凭据。
线上可先检查 `/health`，再到目标群验证相关命令。

### 配置项

| 配置 | 用途 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Worker Secret，同时注入设置脚本环境 |
| `TELEGRAM_CHAT_ID` | 允许的数字 group ID，保存为 Worker Secret，同时提供给设置脚本 |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook 和手动触发接口的 shared secret |
| `CURRENCY_API_KEY` | `/exrate` 所需的 currencyapi.com key |
| `TELEGRAM_WEBHOOK_URL` | 仅设置脚本使用；没有现有 Webhook 时必需 |
| `TELEGRAM_COMMAND_LANGUAGES` | 仅设置脚本使用；额外菜单语言 |
| `HN_TOP_N` | 保留配置项；当前 digest 和 HN 命令固定取 Top 10 |

唯一 cron 仍是每天的 HN digest：

```toml
[triggers]
crons = ["30 2 * * *"] # 10:30 UTC+8
```

### 本地命令

```bash
npm run dev             # 本地 Worker server
npm run test:scheduled  # 启动暴露 /__scheduled 的本地 cron 测试服务
npm run typecheck       # TypeScript 检查
npm test                # 离线回归测试
npm run logs            # 实时日志；request headers 按敏感信息处理
npm run deploy          # 部署 Worker 代码和配置的 cron
npm run telegram:setup  # 更新 Webhook 和命令菜单
```

`npm run trigger` 是本地 scheduled development 的别名，不会触发 production。
`sync.sh` 验证后部署；`deploy.sh` 安装依赖、验证后部署。两者均不自动运行菜单设置，因为设置脚本需要独立注入凭据。

## 数据源与代码

| 功能 | 来源 | 主要模块 |
| --- | --- | --- |
| Hacker News | Firebase HN API，保留 API 给出的排名顺序 | `src/hn-api.ts` |
| Ars Technica | Ars Technica RSS | `src/ars-api.ts` |
| Crypto 报价 | Coinbase Exchange product stats | `src/crypto.ts` |
| 股票、原油 Futures、市场指数 | Yahoo Finance chart API | `src/yahoo-finance.ts`、`stocks.ts`、`oil.ts`、`market.ts` |
| 菲律宾油价 | GasWatch PH 发布的 Metro Manila 均价 | `src/oil.ts` |
| ETH brief | Coinbase 价格、可选 CoinGecko market cap、DeFiLlama | `src/eth-brief.ts` |
| USD 汇率 | currencyapi.com | `src/exrate-api.ts` |
| 经济日程 | Federal Reserve、BLS、EIA | `src/calendar.ts` |
| 运行状态 | 命令调用记录和 Telegram Webhook API | `src/monitoring.ts` |

`src/index.ts` 负责命令和 cron；`src/access.ts` 验证 Webhook 和 group；`src/telegram.ts` 处理 Telegram API 与 owner 查询；`src/display.ts` 提供显示 helpers。
`scripts/setup-telegram.mjs` 设置菜单和 Webhook 鉴权。`tests/` 覆盖数据解析、部分失败、缓存格式兼容、权限和显示。
`commands.txt` 仅列公共命令，设置脚本单独加入两个 owner 命令。

## 排障

**命令没有回复：** 确认在目标群内，owner 执行 `/status`，再检查 `npm run logs`。开启 Telegram privacy mode 或群内存在多个 bot 时，可明确使用 `/market@YourBotUsername`。核对 Webhook 路径是 `/webhook`，且 Secret 与 Worker 一致。`/health` 仅验证基本连通性。

**owner 命令没有显示：** 使用当前群凭据和对应菜单语言重新运行设置脚本，并切回个人身份。手动输入命令不会绕过 owner 校验。

**报价时间较早或来源不可用：** 检查数据源时间与交易时段。无应用缓存不代表上游实时，菲律宾油价按周更新；来源失败时不会返回旧缓存冒充新报价。

**`/exrate` 报错：** 确认 `CURRENCY_API_KEY`。解析器兼容历史 flat 与 nested KV 格式，并在格式化前拒绝缺失或无效汇率。

**没有每日推送：** 检查 cron 和 Telegram 发送日志。携带 shared secret 请求 `POST /trigger` 会发送真实群消息；本地 scheduled 测试不能证明 production 已正常投递。

## 许可证

[ISC](https://choosealicense.com/licenses/isc/)
