#!/bin/bash

set -e

echo "🚀 Syncing to Cloudflare..."

npx tsc --noEmit && npx wrangler deploy

echo "✅ Done!"
