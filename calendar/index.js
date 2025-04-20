/**
 * Calendar module for Outlook MCP server
 */
const handleListEvents = require('./list');

// Calendar tool definitions
const calendarTools = [
  {
    name: "list-events",
    description: "Lists upcoming events from your calendar",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of events to retrieve (default: 10, max: 50)"
        }
      },
      required: []
    },
    handler: handleListEvents
  }
];

module.exports = {
  calendarTools,
  handleListEvents
};
