# Deployment Guide

This guide explains how to deploy the Zendesk MCP Server to Cloudflare Workers using GitHub Actions.

## Prerequisites

1. A Cloudflare account with Workers enabled
2. A GitHub repository with Actions enabled
3. Zendesk API credentials
4. GitHub OAuth App credentials

## GitHub Secrets Configuration

You need to configure the following secrets in your GitHub repository settings:

### Cloudflare Secrets

1. **CLOUDFLARE_API_TOKEN**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Create a new API token with "Edit Workers" permissions
   - Copy the token and add it as a secret

2. **CLOUDFLARE_ACCOUNT_ID**
   - Find your account ID in the Cloudflare dashboard
   - Usually visible in the right sidebar of your Workers dashboard

### Production Environment Secrets

3. **ZENDESK_SUBDOMAIN**
   - Your Zendesk subdomain (e.g., "yourcompany" from yourcompany.zendesk.com)

4. **ZENDESK_EMAIL**
   - The email address associated with your Zendesk API key

5. **ZENDESK_API_KEY**
   - Your Zendesk API key
   - Generate from: Zendesk Admin → API → Settings

6. **GITHUB_CLIENT_ID**
   - From your GitHub OAuth App settings

7. **GITHUB_CLIENT_SECRET**
   - From your GitHub OAuth App settings

8. **GITHUB_REDIRECT_URL**
   - The callback URL for your GitHub OAuth App
   - Should be: `https://your-worker.workers.dev/authorize`

### Staging Environment Secrets (Optional)

For staging deployments, prefix each secret with `STAGING_`:
- STAGING_ZENDESK_SUBDOMAIN
- STAGING_ZENDESK_EMAIL
- STAGING_ZENDESK_API_KEY
- STAGING_GITHUB_CLIENT_ID
- STAGING_GITHUB_CLIENT_SECRET
- STAGING_GITHUB_REDIRECT_URL

## Deployment Workflows

### Production Deployment

The production deployment workflow (`deploy.yml`) runs automatically when:
- Code is pushed to the `main` branch
- Manually triggered via GitHub Actions UI

Steps performed:
1. Checkout code
2. Install dependencies
3. Run tests
4. Type check
5. Deploy to Cloudflare Workers

### Staging Deployment

The staging deployment workflow (`deploy-staging.yml`) runs automatically when:
- A pull request is opened or updated

Steps performed:
1. Same as production, but deploys to staging environment
2. Comments on the PR with deployment status

## Manual Deployment

To deploy manually from your local machine:

```bash
# Set environment variables
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"

# Deploy to production
npm run deploy

# Deploy to staging
npm run deploy -- --env staging
```

## Wrangler Configuration

For staging deployments, add this to your `wrangler.jsonc`:

```jsonc
{
  "name": "zendesk-mcp-server",
  "main": "src/index.ts",
  "compatibility_date": "2025-02-11",
  // ... other config ...
  
  "environments": {
    "staging": {
      "name": "zendesk-mcp-server-staging",
      "vars": {
        // Staging-specific variables
      }
    }
  }
}
```

## Monitoring Deployments

1. **GitHub Actions**: Check the Actions tab in your repository
2. **Cloudflare Dashboard**: Monitor your Workers in the Cloudflare dashboard
3. **Worker Logs**: Use `wrangler tail` to stream logs

## Rollback

If a deployment causes issues:

1. **Via GitHub**: Revert the commit and push to main
2. **Via Cloudflare**: Use the Workers dashboard to rollback to a previous version
3. **Emergency**: Disable the Worker in Cloudflare dashboard

## Security Best Practices

1. **Rotate secrets regularly**
2. **Use different credentials for staging and production**
3. **Limit API token permissions to minimum required**
4. **Enable 2FA on all accounts**
5. **Review deployment logs regularly**

## Troubleshooting

### Deployment Fails

1. Check GitHub Actions logs for error messages
2. Verify all secrets are set correctly
3. Ensure wrangler.jsonc is valid
4. Check Cloudflare API token permissions

### Worker Not Responding

1. Check Worker logs: `wrangler tail`
2. Verify environment variables are set
3. Check for runtime errors in Cloudflare dashboard

### Authentication Issues

1. Verify GitHub OAuth App settings
2. Check redirect URLs match exactly
3. Ensure secrets are not expired

## Support

For issues specific to:
- **Cloudflare Workers**: [Cloudflare Community](https://community.cloudflare.com)
- **GitHub Actions**: [GitHub Community](https://github.community)
- **This project**: Open an issue in the repository