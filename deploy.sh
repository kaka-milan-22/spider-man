#!/bin/bash

set -e

echo "🚀 Hacker News Telegram Bot - Deployment Script"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ Error: npx not found. Please install Node.js and npm.${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm ci

# TypeScript check
echo -e "${YELLOW}🔍 Running TypeScript check...${NC}"
npx tsc --noEmit

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ TypeScript check failed. Please fix errors before deploying.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ TypeScript check passed${NC}"

# Check if wrangler.toml exists
if [ ! -f "wrangler.toml" ]; then
    echo -e "${YELLOW}⚠️  wrangler.toml not found. Creating from example...${NC}"
    if [ -f "wrangler.toml.example" ]; then
        cp wrangler.toml.example wrangler.toml
        echo -e "${YELLOW}⚠️  Please edit wrangler.toml with your KV namespace IDs before deploying.${NC}"
        exit 1
    else
        echo -e "${RED}❌ wrangler.toml.example not found.${NC}"
        exit 1
    fi
fi

# Deploy
echo -e "${YELLOW}☁️  Deploying to Cloudflare...${NC}"
npx wrangler deploy

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    echo -e "${GREEN}🎉 Your HN Telegram Bot is now live!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Set up your secrets: wrangler secret put TELEGRAM_BOT_TOKEN"
    echo "  2. Set up your secrets: wrangler secret put TELEGRAM_CHAT_ID"
    echo "  3. Test the bot: make test"
    echo "  4. View logs: make logs"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi
