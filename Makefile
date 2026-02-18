.PHONY: dev deploy setup logs test release check secrets

# Local development
dev:
	npx wrangler dev

# Deploy to Cloudflare
deploy:
	npx wrangler deploy

# First-time setup - create KV namespace
setup:
	npx wrangler kv:namespace create HN_STORIES
	@echo "KV namespace created! Now run: make secrets"

# Set secrets (requires user input)
secrets:
	npx wrangler secret put TELEGRAM_BOT_TOKEN
	npx wrangler secret put TELEGRAM_CHAT_ID

# View logs
logs:
	npx wrangler tail

# Manual trigger for testing
test:
	npx wrangler triggers scheduled

# TypeScript check
check:
	npx tsc --noEmit

# Full release: deploy + test
release: deploy
	@echo "Deployed! Testing..."
	npx wrangler triggers scheduled
