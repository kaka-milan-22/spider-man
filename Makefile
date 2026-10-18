.PHONY: dev deploy setup logs test release check secrets

# Local development
dev:
	npx wrangler dev

# Deploy to Cloudflare
deploy:
	npx wrangler deploy

# First-time setup - create KV namespace
setup:
	npx wrangler kv namespace create HN_STORIES
	@echo "KV namespace created! Now run: make secrets"

# Set secrets (requires user input)
secrets:
	npx wrangler secret put TELEGRAM_BOT_TOKEN
	npx wrangler secret put TELEGRAM_CHAT_ID
	npx wrangler secret put TELEGRAM_WEBHOOK_SECRET

# View logs
logs:
	npx wrangler tail

# Offline regression tests; scheduled development is npm run test:scheduled
test:
	npm test

# TypeScript check
check:
	npx tsc --noEmit

# Validate before deployment; production delivery is verified separately.
release: check test
	npm run deploy
