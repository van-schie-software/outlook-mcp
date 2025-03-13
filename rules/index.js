/**
 * Email rules management module for Outlook MCP server
 */
const handleListRules = require('./list');
const handleCreateRule = require('./create');

// Rules management tool definitions
const rulesTools = [
  {
    name: "list-rules",
    description: "Lists inbox rules in your Outlook account",
    inputSchema: {
      type: "object",
      properties: {
        includeDetails: {
          type: "boolean",
          description: "Include detailed rule conditions and actions"
        }
      },
      required: []
    },
    handler: handleListRules
  },
  {
    name: "create-rule",
    description: "Creates a new inbox rule",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the rule to create"
        },
        fromAddresses: {
          type: "string",
          description: "Comma-separated list of sender email addresses for the rule"
        },
        containsSubject: {
          type: "string",
          description: "Subject text the email must contain"
        },
        hasAttachments: {
          type: "boolean",
          description: "Whether the rule applies to emails with attachments"
        },
        moveToFolder: {
          type: "string",
          description: "Name of the folder to move matching emails to"
        },
        markAsRead: {
          type: "boolean", 
          description: "Whether to mark matching emails as read"
        },
        isEnabled: {
          type: "boolean",
          description: "Whether the rule should be enabled after creation (default: true)"
        }
      },
      required: ["name"]
    },
    handler: handleCreateRule
  }
];

module.exports = {
  rulesTools,
  handleListRules,
  handleCreateRule
};
