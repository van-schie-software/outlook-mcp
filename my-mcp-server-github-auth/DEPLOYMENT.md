# Deployment Guide

This guide explains how to set up automated deployment for the Zendesk MCP Server.

## Prerequisites

1. A Cloudflare account with Workers enabled
2. A GitHub repository with admin access
3. Cloudflare API tokens configured

## Setting up GitHub Secrets

The automated deployment requires the following secrets to be configured in your GitHub repository:

### Required Secrets

1. **CLOUDFLARE_API_TOKEN**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template
   - Set permissions:
     - Account: Cloudflare Workers Scripts:Edit
     - Zone: Workers Routes:Edit (if using custom domains)
   - Copy the generated token

2. **CLOUDFLARE_ACCOUNT_ID** (Optional but recommended)
   - Find your account ID in the Cloudflare dashboard
   - Right sidebar under "Account ID"

### Setting Secrets in GitHub

1. Navigate to your repository on GitHub
2. Go to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with its corresponding value

## Deployment Workflows

### Automatic Deployment (main branch)

Every push to the `main` branch triggers:
1. Code checkout
2. Dependency installation
3. Type checking
4. Test execution
5. Coverage report generation
6. Deployment to Cloudflare Workers (only if tests pass)

### Pull Request Testing

Pull requests automatically run:
1. Tests on Node.js 18 and 20
2. Type checking
3. Coverage report generation

## Manual Deployment

You can manually trigger a deployment:
1. Go to Actions tab in GitHub
2. Select "Test and Deploy to Cloudflare Workers"
3. Click "Run workflow"
4. Select branch and click "Run workflow"

## Monitoring Deployments

### GitHub Actions

- Check the Actions tab for workflow runs
- Green checkmark = successful deployment
- Red X = failed deployment (check logs)

### Cloudflare Dashboard

- Visit [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
- Check your worker's status and metrics
- View real-time logs and errors

## Rollback Procedure

If a deployment causes issues:

1. **Quick Rollback via Cloudflare:**
   ```bash
   # List deployments
   npx wrangler deployments list
   
   # Rollback to previous version
   npx wrangler rollback [deployment-id]
   ```

2. **Git Revert:**
   ```bash
   # Revert the problematic commit
   git revert [commit-hash]
   git push origin main
   ```

## Environment-Specific Configuration

### Development
- Uses `.dev.vars` for local secrets
- Runs on `localhost:8788`

### Production
- Uses GitHub Secrets for sensitive data
- Deploys to `*.workers.dev` domain

## Troubleshooting

### Common Issues

1. **"Authentication error" during deployment**
   - Check CLOUDFLARE_API_TOKEN is correctly set
   - Ensure token has proper permissions

2. **"Script not found" error**
   - Verify wrangler.toml configuration
   - Check that build output exists

3. **Tests failing in CI but passing locally**
   - Check Node.js version compatibility
   - Ensure all dependencies are in package.json
   - Verify environment variables

### Debug Steps

1. Check GitHub Actions logs
2. Verify secrets are set correctly
3. Test deployment locally with `npx wrangler deploy --dry-run`
4. Check Cloudflare Workers logs for runtime errors

## Security Best Practices

1. Never commit secrets to the repository
2. Use least-privilege API tokens
3. Regularly rotate API tokens
4. Monitor deployment logs for sensitive data
5. Use branch protection rules on `main`

## Cost Considerations

Cloudflare Workers pricing:
- First 100,000 requests/day free
- Monitor usage in Cloudflare dashboard
- Set up billing alerts if needed