# Modular Outlook MCP Server

This is a modular implementation of the Outlook MCP (Model Context Protocol) server that connects Claude with Microsoft Outlook through the Microsoft Graph API.

## Directory Structure

```
/modular/
├── index.js                 # Main entry point
├── config.js                # Configuration settings
├── auth/                    # Authentication modules
│   ├── index.js             # Authentication exports
│   ├── token-manager.js     # Token storage and refresh
│   └── tools.js             # Auth-related tools
├── email/                   # Email functionality
│   ├── index.js             # Email exports
│   ├── list.js              # List emails
│   ├── search.js            # Search emails
│   ├── read.js              # Read email
│   └── send.js              # Send email
└── utils/                   # Utility functions
    ├── graph-api.js         # Microsoft Graph API helper
    ├── odata-helpers.js     # OData query building
    └── mock-data.js         # Test mode data
```

## Features

- **Authentication**: OAuth 2.0 authentication with Microsoft Graph API
- **Email Management**: List, search, read, and send emails
- **Modular Structure**: Clean separation of concerns for better maintainability
- **OData Filter Handling**: Proper escaping and formatting of OData queries
- **Test Mode**: Simulated responses for testing without real API calls

## Configuration

To configure the server, edit the `config.js` file to change:

- Server name and version
- Test mode settings
- Authentication parameters
- Email field selections
- API endpoints

## Usage with Claude Desktop

1. Copy the sample configuration from `claude-config-sample.json` to your Claude Desktop configuration
2. Restart Claude Desktop
3. Authenticate with Microsoft using the `authenticate` tool
4. Use the email tools to manage your Outlook account

## Running Standalone

You can test the server using:

```bash
./test-modular-server.sh
```

This will use the MCP Inspector to directly connect to the server and let you test the available tools.

## Authentication Flow

1. Start a local authentication server on port 3333 (using `outlook-auth-server.js`)
2. Use the `authenticate` tool to get an authentication URL
3. Complete the authentication in your browser
4. Tokens are stored in `~/.outlook-mcp-tokens.json`

## Troubleshooting

- **Authentication Issues**: Check the token file and authentication server logs
- **OData Filter Errors**: Look for escape sequences in the server logs
- **API Call Failures**: Check for detailed error messages in the response

## Extending the Server

To add more functionality:

1. Create new module directories (e.g., `calendar/`)
2. Implement tool handlers in separate files
3. Export tool definitions from module index files
4. Import and add tools to `TOOLS` array in `index.js`
