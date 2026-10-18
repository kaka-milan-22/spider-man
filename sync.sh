#!/bin/bash

set -e

echo "🚀 Syncing to Cloudflare..."

npm run typecheck
npm test
npm run deploy

echo "✅ Done!"
