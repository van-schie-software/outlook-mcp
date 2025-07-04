import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyMCP } from './index';
import { DurableObjectState } from '@cloudflare/workers-types';

// Mock de HELE zendesk-client module
const mockZendeskGetTicket = vi.fn();
const mockZendeskGetComments = vi.fn();
const mockZendeskCreateComment = vi.fn();
const mockZendeskGetKnowledgeBase = vi.fn();

vi.mock('./zendesk-client', () => ({
  ZendeskClientWrapper: vi.fn().mockImplementation(() => ({
    get_ticket: mockZendeskGetTicket,
    get_ticket_comments: mockZendeskGetComments,
    create_ticket_comment: mockZendeskCreateComment,
    getKnowledgeBase: mockZendeskGetKnowledgeBase,
  })),
}));

// Mock de MCP SDK server
const mockCallTool = vi.fn();
const mockSetRequestHandler = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/durable-object.js', () => ({
  DurableObjectMcpServer: vi.fn().mockImplementation(() => ({
    server: {
      callTool: mockCallTool,
      setRequestHandler: mockSetRequestHandler,
    },
    init: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Dummy environment en props
const dummyEnv = {
  ZENDESK_SUBDOMAIN: 'test',
  ZENDESK_EMAIL: 'test@example.com',
  ZENDESK_API_KEY: 'test-key',
} as any;

const dummyProps = {
  login: 'test-user',
  accessToken: 'test-token',
} as any;

// Mock DurableObjectState
const mockState = {
  storage: {
    get: vi.fn(),
    put: vi.fn(),
  },
} as unknown as DurableObjectState;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MyMCP Zendesk Integration', () => {
  describe('Tool registration', () => {
    it('should register all Zendesk tools during initialization', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);

      // --- ACT ---
      await mcpServer.init();

      // --- ASSERT ---
      // Check if setRequestHandler was called with proper tools
      expect(mockSetRequestHandler).toHaveBeenCalledTimes(1);
      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      
      expect(handlerConfig.listTools).toBeDefined();
      const tools = await handlerConfig.listTools();
      
      // Verify all tools are registered
      const toolNames = tools.tools.map((t: any) => t.name);
      expect(toolNames).toContain('zendesk/get_ticket');
      expect(toolNames).toContain('zendesk/get_ticket_comments');
      expect(toolNames).toContain('zendesk/create_ticket_comment');
      expect(toolNames).toContain('zendesk/search_knowledge_base');
    });
  });

  describe('zendesk/get_ticket tool', () => {
    it('should call zendeskClient.get_ticket with correct parameters', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskGetTicket.mockResolvedValue({
        id: 789,
        subject: 'Test Ticket',
        description: 'Test Description',
        status: 'open',
        priority: 'high',
      });

      // Get the tool handler
      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ name: 'zendesk/get_ticket', arguments: { id: 789 } });

      // --- ASSERT ---
      expect(mockZendeskGetTicket).toHaveBeenCalledTimes(1);
      expect(mockZendeskGetTicket).toHaveBeenCalledWith(789);
      expect(result.content[0].text).toContain('Test Ticket');
      expect(result.content[0].text).toContain('Test Description');
      expect(result.content[0].text).toContain('open');
      expect(result.content[0].text).toContain('high');
    });

    it('should handle missing ticket ID', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT & ASSERT ---
      await expect(callToolHandler({ name: 'zendesk/get_ticket', arguments: {} }))
        .rejects.toThrow('Ticket ID is required');
    });
  });

  describe('zendesk/get_ticket_comments tool', () => {
    it('should fetch and format ticket comments', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskGetComments.mockResolvedValue([
        { id: 1, body: 'First comment', public: true, created_at: '2024-01-01T00:00:00Z' },
        { id: 2, body: 'Second comment', public: false, created_at: '2024-01-02T00:00:00Z' }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk/get_ticket_comments', 
        arguments: { ticket_id: 456 } 
      });

      // --- ASSERT ---
      expect(mockZendeskGetComments).toHaveBeenCalledTimes(1);
      expect(mockZendeskGetComments).toHaveBeenCalledWith(456);
      expect(result.content[0].text).toContain('First comment');
      expect(result.content[0].text).toContain('Second comment');
      expect(result.content[0].text).toContain('Public: Yes');
      expect(result.content[0].text).toContain('Public: No');
    });
  });

  describe('zendesk/create_ticket_comment tool', () => {
    it('should create a public comment', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskCreateComment.mockResolvedValue(undefined);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk/create_ticket_comment', 
        arguments: { 
          ticket_id: 123,
          body: 'Test comment',
          public: true
        } 
      });

      // --- ASSERT ---
      expect(mockZendeskCreateComment).toHaveBeenCalledTimes(1);
      expect(mockZendeskCreateComment).toHaveBeenCalledWith(123, 'Test comment', true);
      expect(result.content[0].text).toContain('Comment added successfully');
    });

    it('should create a private comment by default', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskCreateComment.mockResolvedValue(undefined);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk/create_ticket_comment', 
        arguments: { 
          ticket_id: 456,
          body: 'Internal note'
          // public not specified, should default to false
        } 
      });

      // --- ASSERT ---
      expect(mockZendeskCreateComment).toHaveBeenCalledTimes(1);
      expect(mockZendeskCreateComment).toHaveBeenCalledWith(456, 'Internal note', false);
    });
  });

  describe('zendesk/search_knowledge_base tool', () => {
    it('should search knowledge base and return matching articles', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskGetKnowledgeBase.mockResolvedValue([
        {
          id: 1,
          name: 'General',
          articles: [
            { id: 101, title: 'How to restart', body: 'Press the restart button to restart the system.' },
            { id: 102, title: 'Login issues', body: 'If you cannot login, try resetting your password.' }
          ]
        },
        {
          id: 2,
          name: 'Technical',
          articles: [
            { id: 201, title: 'API Guide', body: 'Use our REST API to integrate with the system.' }
          ]
        }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk/search_knowledge_base', 
        arguments: { query: 'restart' } 
      });

      // --- ASSERT ---
      expect(mockZendeskGetKnowledgeBase).toHaveBeenCalledTimes(1);
      expect(result.content[0].text).toContain('How to restart');
      expect(result.content[0].text).toContain('Press the restart button');
      expect(result.content[0].text).not.toContain('Login issues');
      expect(result.content[0].text).not.toContain('API Guide');
    });

    it('should handle empty search results', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskGetKnowledgeBase.mockResolvedValue([
        {
          id: 1,
          name: 'General',
          articles: [
            { id: 101, title: 'How to restart', body: 'Press the restart button.' }
          ]
        }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk/search_knowledge_base', 
        arguments: { query: 'nonexistent' } 
      });

      // --- ASSERT ---
      expect(result.content[0].text).toContain('No articles found');
    });
  });

  describe('Error handling', () => {
    it('should handle Zendesk API errors gracefully', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      mockZendeskGetTicket.mockRejectedValue(new Error('Zendesk API Error'));

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT & ASSERT ---
      await expect(callToolHandler({ 
        name: 'zendesk/get_ticket', 
        arguments: { id: 999 } 
      })).rejects.toThrow('Zendesk API Error');
    });

    it('should validate required environment variables', () => {
      // --- ARRANGE ---
      const invalidEnv = {
        // Missing all Zendesk configuration
      } as any;

      // --- ACT & ASSERT ---
      expect(() => new MyMCP(mockState, invalidEnv, dummyProps))
        .toThrow();
    });
  });

  describe('HTTP request handling', () => {
    it('should handle GET requests for server information', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, dummyEnv, dummyProps);
      await mcpServer.init();
      
      const request = new Request('https://example.com/');

      // --- ACT ---
      const response = await mcpServer.fetch(request);
      const data = await response.json() as any;

      // --- ASSERT ---
      expect(response.status).toBe(200);
      expect(data.name).toBe('zendesk-mcp-server');
      expect(data.version).toBe('1.0.0');
    });
  });
});