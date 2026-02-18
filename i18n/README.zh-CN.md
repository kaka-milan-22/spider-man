# HN & Ars Technica Telegram Bot

一个 Cloudflare Worker，每天自动获取 Top 10 Hacker News 文章和 Ars Technica 文章并发送到你的 Telegram 群组，同时提取关键词和文章摘要。

## 语言

默认：English 🇺🇸  
🇺🇸 [English Documentation](../README.md) | 🇨🇳 [中文文档](README.zh-CN.md)

## 功能特性

- **Hacker News**：获取 Top 10 文章（按分数排序）
- **Ars Technica**：获取 Top 10 文章（含摘要和发布时间）
- **Bot 命令**：通过 Telegram 命令按需获取文章
- **智能缓存**：命令结果缓存 2 小时，Ars RSS 缓存 1 小时
- **关键词提取**：本地提取每篇 HN 文章的 10 个关键词（无需 AI API）
- **消息格式化**：使用表情符号和 Markdown 格式发送消息
- **去重机制**：使用 Cloudflare KV 去重（7 天过期）
- **定时推送**：每天北京时间 10:30 自动推送

## 环境要求

- Node.js 18+
- Cloudflare 账号
- Telegram Bot Token（从 @BotFather 获取）
- Telegram Chat ID

## 安装

```bash
npm install
```

## 快速开始

### 1. 创建 Telegram Bot

1. 在 Telegram 搜索 [@BotFather](https://t.me/botfather)
2. 发送 `/newbot` 并按提示操作
3. 保存你的 bot token

### 2. 获取 Chat ID

1. 将 bot 添加到你的群组
2. 在群组中发送一条消息
3. 访问：`https://api.telegram.org/bot<你的TOKEN>/getUpdates`
4. 找到 `"chat":{"id":-123456789`（群组为负数）

### 3. 配置 Wrangler

```bash
# 复制示例配置
cp wrangler.toml.example wrangler.toml

# 登录 Cloudflare
npx wrangler login

# 创建 KV namespace
npm run kv:create
```

用你的 KV namespace ID 更新 `wrangler.toml`。

### 4. 设置 Secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### 5. 部署

```bash
npm run deploy
```

### 6. 设置 Webhook

```bash
curl -X POST "https://api.telegram.org/bot<你的TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://你的worker.workers.dev/webhook"}'
```

### 7. 测试

```bash
npm run trigger
```

## Bot 命令

| 命令 | 描述 |
|---------|-------------|
| `/top10hn` | 获取 Top 10 Hacker News 文章（按 points 排序） |
| `/top10ars` | 获取 Top 10 Ars Technica 文章（含摘要和时间） |
| `/btc` | 获取加密货币价格（BTC, ETH, BNB, SOL, TON, DOT, LINK, AVAX） |
| `/flushcache` | 清除所有缓存数据 |

命令结果缓存时间：
- Hacker News：2 小时
- Ars Technica：1 小时

## 常用命令

```bash
npm run dev         # 本地开发
npm run deploy      # 部署到 Cloudflare
npm run logs        # 查看实时日志
npm run trigger     # 手动触发 bot
npm run typecheck   # TypeScript 类型检查
./sync.sh           # 类型检查 + 部署
```

## 配置

### 环境变量

| 变量 | 必需 | 描述 |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | 是 | 来自 @BotFather 的 bot token |
| `TELEGRAM_CHAT_ID` | 是 | 目标聊天/群组 ID |
| `HN_TOP_N` | 否 | 文章数量（默认：10） |

### Cron 定时

默认：每天北京时间 10:30（UTC 02:30）

编辑 `wrangler.toml`：
```toml
[triggers]
crons = ["30 2 * * *"]
```

## 项目结构

```
hn-telegram-bot/
├── src/
│   ├── index.ts          # 主 Worker 处理器
│   ├── hn-api.ts         # Hacker News API 客户端
│   ├── ars-api.ts        # Ars Technica RSS 客户端
│   ├── keywords.ts       # 关键词提取
│   ├── telegram.ts       # Telegram Bot API 客户端
│   ├── formatters.ts     # 消息格式化
│   ├── crypto.ts         # 加密货币价格获取
│   ├── config.ts         # 环境配置
│   └── types.ts          # TypeScript 类型
├── wrangler.toml         # Cloudflare 配置
├── commands.txt          # Bot 命令参考
├── sync.sh               # 快速部署脚本
└── deploy.sh             # 完整部署脚本
```

## 数据来源

| 来源 | 类型 | URL |
|------|------|-----|
| Hacker News | JSON API | `https://hacker-news.firebaseio.com/v0/` |
| Ars Technica | RSS Feed | `https://arstechnica.com/feed/` |
| 加密货币价格 | API | CoinGecko |

## 工作原理

### 定时推送

1. 每天 10:30 北京时间触发
2. 从 HN Firebase API 获取热门文章
3. 检查 KV 跳过已发送的文章
4. 提取文章关键词
5. 发送格式化消息到 Telegram

### Bot 命令

1. Webhook 接收来自 Telegram 的命令
2. 检查缓存（1-2 小时过期，根据来源）
3. 如果缓存未命中：获取、处理、格式化
4. 发送格式化消息

### Ars Technica 输出格式

```
📰 *Ars Technica Top 10*

1. [文章标题](URL)
   📝 文章摘要...
   📅 2月18日 14:30

2. [文章标题](URL)
   📝 文章摘要...
   📅 2月18日 13:15
```

## 常见问题

### Bot 不响应命令

1. 检查 webhook：`https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
2. 确认 worker URL 正确
3. 查看日志：`npm run logs`

### Bot 不发送每日消息

1. 检查 `wrangler.toml` 中的 cron 设置
2. 确认 secrets 设置正确
3. 手动触发：`npm run trigger`

## 许可证

[ISC](https://choosealicense.com/licenses/isc/)
