# Spider-Man Telegram Bot

基于 TypeScript 和 Cloudflare Worker 的 Telegram 群组助手，提供新闻、行情、经济日程和运行状态。
每天 **10:30 UTC+8** 推送 Hacker News digest，**11:00 UTC+8** 抓取最新数据并推送市场简报；`/brief` 复用最近 24 小时内的简报。单项查询命令继续可用。

[English](../README.md) · [简体中文](README.zh-CN.md) · [Changelog](../CHANGELOG.md)

## 命令

普通命令对目标群的所有成员开放。其他群和私聊中的命令会被忽略。

| 命令 | 内容 | 应用缓存 |
| --- | --- | --- |
| `/brief` | 手机网页市场简报；自动推送强制刷新，手动调用复用缓存 | 最新缓存 24 小时；历史保留 7 天 |
| `/top10hn` | 按 Hacker News API 原始顺序返回 10 条有效文章 | 2 小时 |
| `/top10ars` | Ars Technica RSS 最新 10 篇文章，含摘要和时间 | 2 小时 |
| `/btc` | CoinGecko 批量 USD 报价与 24 小时涨跌，Coinbase 备用；失败显示“暂无报价” | 无 |
| `/coin [Symbol 或 ID]` | 查询单币 USD 价格和 24h 涨跌幅；不带参数默认 BTC | 无 |
| `/stocks` | 10 个美股（含 Anthropic / ANT） 的价格和日涨跌 | 无 |
| `/oil` | Brent/WTI Futures 与 Metro Manila 汽油 / Diesel 参考价 | 无 |
| `/market` | S&P 500、Nasdaq Composite、DXY、US 10Y Treasury yield、VIX | 无 |
| `/calendar` | 未来 7 天的 FOMC、CPI、非农、EIA 官方日程 | 无 |
| `/calendar 30` | 查看未来 30 天的上述日程 | 无 |
| `/eth` | ETH/BTC 价格、Ethereum DeFi TVL、protocols、stablecoins、DEX volume | 2 小时 |
| `/exrate` | USD 对 PHP、MYR、TWD、HKD、CNY、THB、VND 的汇率 | 2 小时 |
| `/status` | 最近调用结果、耗时、成功时间和实时 Webhook 状态 | 仅 owner |
| `/flushcache` | 清除绑定 KV namespace 的所有 key，包括状态记录 | 仅 owner |

`/btc` 请求 BTC、ETH、BNB、SOL、TON、DOT、LINK、AVAX、UNI、AAVE、PAXG。CoinGecko 一次批量查询，仅对缺失或过期币种补查一次；Coinbase 仅补查剩余币种，最多 4 个并发，分批错峰。两个来源合计每个币种最多尝试 3 次，每次 timeout 为 4 秒；遵守 Retry-After，长限流窗口内不继续重试。拒绝超过 5 分钟的 CoinGecko 报价。缺少 24h 涨跌时保留有效价格，不使用旧价格兜底。
当前没有 `/alert`，也没有后台行情轮询。

`/coin` 不带参数默认查询 BTC，例如 `/coin eth`、`/coin PAXG`、`/coin doge`、`/coin shiba-inu`。Symbol、CoinGecko ID 或完整名称不区分大小写，必须精确匹配；重名 Symbol 优先选市值排名最高的币，返回结果注明 ID，明确指定 ID 时优先按 ID 匹配。找不到时回复“找不到这个币”；接口失败或暂无报价单独提示。已知币种沿用现有主备源；其他币种只使用 CoinGecko，避免重名 Symbol 错配 Coinbase 资产。不复用旧报价。

CoinGecko 匿名接口在 Worker 的共享出口可能返回 429，生产建议设置 `COINGECKO_API_KEY`。Key 仅通过 `x-cg-demo-api-key` header 发给 CoinGecko。Crypto 板块底部统一说明数据源，Coinbase 为独立交易所 USD 报价，可能与聚合报价略有差异。

## 市场简报

页面顺序：市场概览、Crypto（含 PAXG）、股票、USD 汇率、原油及菲律宾油价、未来 7 天经济日程。深色手机布局，导航按钮高 48px，涨绿跌红；汇率逐行显示并包含国旗。股票与 Crypto Logo 缓存在项目并内嵌，不向外部图片服务发请求。

Crypto 与 stocks 统一使用三列表格：资产、USD 价格、涨跌幅。时间以灰色小字显示在 Symbol 下方，不加“报价时间：”前缀，也不单独占用整行；Crypto 优先显示源时间，缺失时显示简报生成时间。UTC+8 统一在页面顶部注明，Crypto 涨跌幅为 24h，stocks 相对前一交易日收盘价。

每天 11:00 UTC+8 自动任务跳过简报缓存与汇率缓存，重新请求全部数据源，然后将新简报缓存 24 小时。`/brief` 缓存命中不请求上游；不存在或过期才生成。关注列表更新会使最新简报缓存失效，保留历史链接。每次生成独立链接，历史快照保留 7 天，最新简报缓存仍为 24 小时；访问网页仅展示已有快照，不触发生成或发群。部分来源失败时保留其他板块并标注缺失，不使用旧数据冒充新数据。

`BRIEF_BASE_URL` 设置为当前 Worker 的 HTTPS origin。网页凭随机链接访问，无需登录；不要公开转发链接。KV 是 eventual consistency：跨区域并发的首次请求可能重复生成，同一 isolate 内会合并并发请求。清空 KV 同时会让简报链接失效。

## 行情与布局

### 美股

`/stocks` 使用 Yahoo Finance，沿用 `/btc` 的紧凑布局。

| Symbol | 对应资产 |
| --- | --- |
| AAPL | Apple |
| NVDA | NVIDIA |
| TSLA | Tesla |
| TSM | 台积电的美股 ADR |
| AMZN | Amazon，AWS 的母公司 |
| MSFT | Microsoft |
| ANT | Anthropic Class A |
| NET | Cloudflare |
| META | Meta Platforms |
| GOOGL | Alphabet Class A |

PAXG 使用 CoinGecko ID `pax-gold`，备用交易对为 Coinbase `PAXG-USD`，单位为 USD / token。Anthropic 尚无实际首笔交易时，IPO 初始数据会显示为“暂无报价”。

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
| `POST /trigger` | 使用相同 Secret；强制生成最新市场简报并发到目标群 |

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
| `COINGECKO_API_KEY` | CoinGecko Demo API key，作为 Worker Secret 保存；不进入源码或页面 |
| `CURRENCY_API_KEY` | `/exrate` 所需的 currencyapi.com key |
| `TELEGRAM_WEBHOOK_URL` | 仅设置脚本使用；没有现有 Webhook 时必需 |
| `TELEGRAM_COMMAND_LANGUAGES` | 仅设置脚本使用；额外菜单语言 |
| `BRIEF_BASE_URL` | 简报网页的 HTTPS origin，供定时任务构造按钮链接 |
| `HN_TOP_N` | 保留配置项；HN 命令固定取 Top 10 |

两个独立的每日 cron 分别推送 10:30 UTC+8 的 HN digest 和 11:00 UTC+8 的市场简报：

Cloudflare cron 表达式使用 UTC。Worker 根据表达式分别执行对应任务，两个配置项都需要保留。

```toml
[triggers]
crons = ["30 2 * * *", "0 3 * * *"] # 10:30 和 11:00 UTC+8
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

`npm run trigger` 是本地 scheduled development 的别名，不会触发 production。通过 `/__scheduled?cron=30+2+*+*+*` 测试 HN，通过 `/__scheduled?cron=0+3+*+*+*` 测试市场简报。
`sync.sh` 验证后部署；`deploy.sh` 安装依赖、验证后部署。两者均不自动运行菜单设置，因为设置脚本需要独立注入凭据。

仅维护菜单时，也可通过 `POST /admin/commands/sync?language=zh`（支持空值、`en`、`zh`），在 `X-Telegram-Bot-Api-Secret-Token` header 使用临时 `COMMAND_SYNC_TOKEN`。接口同步并读回验证目标群、管理员和 owner 的菜单，不修改 Webhook。完成后删除该临时 Secret；Secret 不存在时接口拒绝请求。

生产域名为 `https://econ.kakacn.com`，Custom Domain 已写入 `wrangler.toml`。简报链接与 Telegram Webhook 使用该域名；`workers_dev = false` 和 `preview_urls = false` 关闭默认入口与 preview 入口。后续迁移可用临时 Token 保护的 `POST /admin/webhook/migrate`：保留 Webhook Secret 与待处理消息，读回确认新 URL，并向群里发送简报，验证后再关闭旧入口。

## 数据源与代码

| 功能 | 来源 | 主要模块 |
| --- | --- | --- |
| Hacker News | Firebase HN API，保留 API 给出的排名顺序 | `src/hn-api.ts` |
| Ars Technica | Ars Technica RSS | `src/ars-api.ts` |
| Crypto 报价 | CoinGecko simple/price + Coinbase Exchange 备用 | `src/crypto.ts` |
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

**没有每日推送：** 确认 production 同时配置两个 cron：`30 2 * * *` 对应 10:30 UTC+8 的 HN，`0 3 * * *` 对应 11:00 UTC+8 的市场简报，再检查 cron 和 Telegram 发送日志。携带 shared secret 请求 `POST /trigger` 会发送最新市场简报，不执行 HN digest；本地 scheduled 测试不能证明 production 已正常投递。

**历史简报无法打开：** 从原 Telegram 消息的按钮打开对应快照，自生成起保留 7 天。`/brief` 返回最新简报，不提供历史目录。过期或被删除的快照返回 HTTP 410，重新获取简报无法恢复旧快照；`/flushcache` 也会删除历史简报。

## 许可证

[ISC](https://choosealicense.com/licenses/isc/)
