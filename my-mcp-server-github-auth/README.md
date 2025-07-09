# Zendesk MCP Server

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that provides comprehensive Zendesk integration with GitHub OAuth authentication.

The MCP server enables AI assistants to interact with Zendesk through a wide range of tools for managing tickets, users, organizations, and more. It's built on Cloudflare Workers and uses GitHub OAuth for secure authentication.

## Features

### 🎫 Ticket Management
- **Get Ticket** - Retrieve a specific ticket by ID
- **Create Ticket** - Create new support tickets with comments, priority, and assignments
- **Update Ticket** - Modify ticket properties and status
- **Delete Ticket** - Remove tickets from the system
- **List Tickets** - Browse tickets with filtering options
- **List User Tickets** - Get tickets requested by a specific user
- **List Organization Tickets** - View all tickets for an organization
- **Merge Tickets** - Combine duplicate tickets
- **Create Many Tickets** - Bulk ticket creation

### 👤 User Management
- **List Users** - Browse all users in the system
- **Get User** - Retrieve specific user details
- **Get Current User** - Get authenticated user information
- **Create User** - Add new users to Zendesk
- **Update User** - Modify user properties
- **Delete User** - Remove users from the system
- **Suspend User** - Temporarily disable user access
- **Unsuspend User** - Restore suspended user access

### 🏢 Organization Management
- **List Organizations** - Browse all organizations
- **Get Organization** - Retrieve organization details
- **Create Organization** - Add new organizations
- **Update Organization** - Modify organization properties
- **Delete Organization** - Remove organizations

### 🔍 Search & Knowledge Base
- **Search** - Full-text search across all Zendesk resources
- **Search Tickets** - Search specifically for tickets
- **Search Users** - Find users by various criteria
- **Search Organizations** - Locate organizations
- **Search Knowledge Base** - Find help articles

### 📊 Views & Automation
- **List Views** - Browse available ticket views
- **Get View** - Retrieve view details
- **Execute View** - Get tickets matching view criteria
- **List Groups** - Browse agent groups
- **Get Group** - Retrieve group details
- **List Macros** - Browse available macros
- **Get Macro** - Retrieve macro details
- **List Triggers** - Browse automation triggers
- **Get Trigger** - Retrieve trigger details
- **List Automations** - Browse time-based automations
- **Get Automation** - Retrieve automation details

### 💬 Comments & Communication
- **Get Ticket Comments** - Retrieve all comments for a ticket
- **Create Ticket Comment** - Add public or private comments to tickets

## Getting Started

### Prerequisites
1. A Cloudflare account
2. A GitHub account for OAuth
3. A Zendesk account with API access

### Installation

Clone the repo and install dependencies:
```bash
git clone <repository-url>
cd my-mcp-server-github-auth
npm install
```

### Configuration

#### 1. Set up GitHub OAuth App
Create a new [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app):
- Homepage URL: `https://your-app.<your-subdomain>.workers.dev`
- Authorization callback URL: `https://your-app.<your-subdomain>.workers.dev/callback`

#### 2. Set up Zendesk API Access
In your Zendesk account:
- Go to Admin Center > Apps and integrations > APIs > Zendesk API
- Enable Token Access
- Create an API token

#### 3. Configure Secrets
Set the required secrets using Wrangler:
```bash
# GitHub OAuth
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY

# Zendesk API
wrangler secret put ZENDESK_SUBDOMAIN    # e.g., "mycompany"
wrangler secret put ZENDESK_EMAIL        # Your Zendesk account email
wrangler secret put ZENDESK_API_KEY      # Your Zendesk API token
```

#### 4. Set up KV Namespace
Create the KV namespace for OAuth sessions:
```bash
wrangler kv:namespace create "OAUTH_KV"
```

Update `wrangler.toml` with the generated KV namespace ID.

### Deployment

Deploy the MCP server to Cloudflare Workers:
```bash
wrangler deploy
```

### Testing with Inspector

Test the remote server using [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector):
```bash
npx @modelcontextprotocol/inspector@latest
```

Enter `https://your-app.<your-subdomain>.workers.dev/sse` and connect.

### Connecting to Claude Desktop

Add to your Claude Desktop configuration (`Settings -> Developer -> Edit Config`):
```json
{
  "mcpServers": {
    "zendesk": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-app.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

## Local Development

For local development, create a `.dev.vars` file:
```
GITHUB_CLIENT_ID=your_development_github_client_id
GITHUB_CLIENT_SECRET=your_development_github_client_secret
ZENDESK_SUBDOMAIN=your_zendesk_subdomain
ZENDESK_EMAIL=your_zendesk_email
ZENDESK_API_KEY=your_zendesk_api_token
```

Run locally:
```bash
wrangler dev
```

## Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

Current test coverage: ~75% for core Zendesk client functionality.

## Architecture

- **OAuth Provider**: Handles GitHub authentication and session management
- **Durable MCP**: Provides persistent state and user context
- **Zendesk Client**: Implements comprehensive Zendesk API integration
- **MCP Tools**: Exposes Zendesk functionality as MCP-compatible tools

## Security

- All Zendesk API calls use secure token authentication
- User sessions are encrypted and stored in Cloudflare KV
- GitHub OAuth ensures only authorized users can access the server
- Sensitive operations can be restricted to specific GitHub usernames

## Contributing

Contributions are welcome! Please ensure:
1. All tests pass
2. New features include appropriate tests
3. Code follows existing patterns and conventions

## License

[License information]