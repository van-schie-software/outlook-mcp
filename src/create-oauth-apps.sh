#!/bin/bash

# create-oauth-apps.sh

echo "Creating OAuth apps for MCP Server..."
echo ""

# Get the production URL from wrangler.jsonc
WORKER_URL="https://my-mcp-server-github-auth.vanschie-joost.workers.dev"

echo "Creating OAuth app for local development..."
LOCAL_RESPONSE=$(gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /user/applications/new \
  -f name='My MCP Server (local)' \
  -f url='http://localhost:8787' \
  -f callback_url='http://localhost:8787/callback' 2>&1)

if [[ $? -eq 0 ]]; then
  LOCAL_CLIENT_ID=$(echo $LOCAL_RESPONSE | jq -r '.client_id')
  echo "✓ Local OAuth app created with Client ID: $LOCAL_CLIENT_ID"
else
  echo "✗ Error creating local OAuth app: $LOCAL_RESPONSE"
  exit 1
fi

echo ""
echo "Creating OAuth app for production..."
PROD_RESPONSE=$(gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /user/applications/new \
  -f name='My MCP Server (production)' \
  -f url="$WORKER_URL" \
  -f callback_url="$WORKER_URL/callback" 2>&1)

if [[ $? -eq 0 ]]; then
  PROD_CLIENT_ID=$(echo $PROD_RESPONSE | jq -r '.client_id')
  echo "✓ Production OAuth app created with Client ID: $PROD_CLIENT_ID"
else
  echo "✗ Error creating production OAuth app: $PROD_RESPONSE"
  exit 1
fi

# Cookie encryption key generated earlier
COOKIE_KEY="b/qBbyObgAnEFjJHpL/Qg/+qqcPCQgIyDiVfRBGWYnM="

# Create .dev.vars file for local development
echo ""
echo "Creating .dev.vars file..."
cat > .dev.vars << EOF
GITHUB_CLIENT_ID="$LOCAL_CLIENT_ID"
GITHUB_CLIENT_SECRET="your-local-client-secret-here"
COOKIE_ENCRYPTION_KEY="$COOKIE_KEY"
EOF

echo "✓ Created .dev.vars file"

echo ""
echo "================================================================================"
echo "NEXT STEPS:"
echo "================================================================================"
echo ""
echo "1. Go to https://github.com/settings/developers to generate client secrets"
echo ""
echo "2. For the LOCAL app (My MCP Server (local)):"
echo "   - Find the app and click on it"
echo "   - Generate a new client secret"
echo "   - Update the GITHUB_CLIENT_SECRET in .dev.vars with the generated secret"
echo ""
echo "3. For the PRODUCTION app (My MCP Server (production)):"
echo "   - Find the app and click on it"
echo "   - Generate a new client secret"
echo "   - Set production secrets with these commands:"
echo ""
echo "   wrangler secret put GITHUB_CLIENT_ID"
echo "   # When prompted, enter: $PROD_CLIENT_ID"
echo ""
echo "   wrangler secret put GITHUB_CLIENT_SECRET"
echo "   # When prompted, enter the generated secret from GitHub"
echo ""
echo "   wrangler secret put COOKIE_ENCRYPTION_KEY"
echo "   # When prompted, enter: $COOKIE_KEY"
echo ""
echo "================================================================================"