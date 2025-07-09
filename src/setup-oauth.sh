#!/bin/bash

# setup-oauth.sh

echo "========================================================================"
echo "GitHub OAuth Apps Setup for MCP Server"
echo "========================================================================"
echo ""

# Production URL
WORKER_URL="https://outlook-mcp-github-auth.vanschie-joost.workers.dev"

# Cookie encryption key
COOKIE_KEY="b/qBbyObgAnEFjJHpL/Qg/+qqcPCQgIyDiVfRBGWYnM="

echo "Since OAuth Apps can't be created via API, please follow these steps:"
echo ""
echo "1. OPEN GITHUB OAUTH APPS PAGE:"
echo "   https://github.com/settings/developers"
echo ""
echo "2. CREATE LOCAL DEVELOPMENT APP:"
echo "   Click 'New OAuth App' and use these settings:"
echo "   • Application name: Outlook MCP Server (local)"
echo "   • Homepage URL: http://localhost:8787"
echo "   • Authorization callback URL: http://localhost:8787/callback"
echo "   • Click 'Register application'"
echo "   • Copy the Client ID"
echo "   • Click 'Generate a new client secret' and copy it"
echo ""
echo "3. CREATE PRODUCTION APP:"
echo "   Click 'New OAuth App' again and use these settings:"
echo "   • Application name: Outlook MCP Server (production)"
echo "   • Homepage URL: $WORKER_URL"
echo "   • Authorization callback URL: $WORKER_URL/callback"
echo "   • Click 'Register application'"
echo "   • Copy the Client ID"
echo "   • Click 'Generate a new client secret' and copy it"
echo ""
echo "Press Enter when you have created both OAuth apps..."
read

# Get local OAuth credentials
echo ""
echo "Enter the Client ID for your LOCAL OAuth app:"
read LOCAL_CLIENT_ID

echo "Enter the Client Secret for your LOCAL OAuth app:"
read -s LOCAL_CLIENT_SECRET

# Create .dev.vars file
cat > .dev.vars << EOF
GITHUB_CLIENT_ID="$LOCAL_CLIENT_ID"
GITHUB_CLIENT_SECRET="$LOCAL_CLIENT_SECRET"
COOKIE_ENCRYPTION_KEY="$COOKIE_KEY"
EOF

echo ""
echo "✓ Created .dev.vars file for local development"

# Get production OAuth credentials
echo ""
echo "Enter the Client ID for your PRODUCTION OAuth app:"
read PROD_CLIENT_ID

echo "Enter the Client Secret for your PRODUCTION OAuth app:"
read -s PROD_CLIENT_SECRET

echo ""
echo ""
echo "Now setting production secrets..."
echo ""

# Set production secrets
wrangler secret put GITHUB_CLIENT_ID <<< "$PROD_CLIENT_ID"
wrangler secret put GITHUB_CLIENT_SECRET <<< "$PROD_CLIENT_SECRET"
wrangler secret put COOKIE_ENCRYPTION_KEY <<< "$COOKIE_KEY"

echo ""
echo "========================================================================"
echo "✓ Setup complete!"
echo "========================================================================"
echo ""
echo "You can now:"
echo "1. Run locally with: npm start"
echo "2. Test with MCP inspector: npx @modelcontextprotocol/inspector@latest"
echo "3. Your production server is at: $WORKER_URL/sse"
echo ""