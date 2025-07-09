// tests/mocks/mcp-agent.mock.ts
import { vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

// Mock implementation of DurableObjectState
export const mockState = {
  storage: {
    get: vi.fn(),
    put: vi.fn(),
  },
};

// Mock implementation of Props
export const mockProps = {
  login: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  accessToken: 'test-token',
};

// Mock implementation of Env
export const mockEnv = {
  ZENDESK_SUBDOMAIN: 'test-subdomain',
  ZENDESK_EMAIL: 'test@zendesk.com',
  ZENDESK_API_KEY: 'test-api-key',
  AI: {
    run: vi.fn(),
  },
};

// We definiëren een simpele mock-versie van McpAgent
// die de Cloudflare-specifieke types niet nodig heeft.
export class MockMcpAgent {
  public server: McpServer;
  public state: any;
  public env: any;
  public props: any;
  private zendeskClient: any;

  constructor(state: any = mockState, env: any = mockEnv, props: any = mockProps) {
    this.state = state;
    this.env = env;
    this.props = props;
    this.server = new McpServer({
      name: 'zendesk-mcp-server',
      version: '1.0.0',
    });
  }

  // Mock getZendeskClient method
  getZendeskClient() {
    if (!this.zendeskClient) {
      // Return the mocked zendesk client from our vi.mock
      const { ZendeskClientWrapper } = require('../../src/zendesk-client');
      this.zendeskClient = new ZendeskClientWrapper(this.env);
    }
    return this.zendeskClient;
  }

  // Mock init method
  async init() {
    // This would normally register all tools
    // For testing, we'll just return
    return Promise.resolve();
  }

  // Mock fetch method (for HTTP handling)
  async fetch(_request: Request): Promise<Response> {
    return new Response(JSON.stringify({
      name: 'zendesk-mcp-server',
      version: '1.0.0',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}