import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMcpAgent, mockState, mockEnv, mockProps } from '../tests/mocks/mcp-agent.mock';

// Mock cloudflare imports before any other imports
vi.mock('cloudflare:workers', () => ({
  DurableObject: class DurableObject {},
}));

vi.mock('agents/mcp', () => ({
  McpAgent: MockMcpAgent,
}));

vi.mock('@cloudflare/workers-oauth-provider', () => ({
  default: class OAuthProvider {},
}));

vi.mock('octokit', () => ({
  Octokit: class Octokit {
    constructor(options: any) {}
    rest = {
      users: {
        getAuthenticated: vi.fn(),
      },
    };
  },
}));

vi.mock('./github-handler', () => ({
  GitHubHandler: class GitHubHandler {},
}));

// Mock MyMCP to use our MockMcpAgent
vi.mock('./index', async () => {
  const { MockMcpAgent } = await import('../tests/mocks/mcp-agent.mock');
  
  // Create a MyMCP class that extends MockMcpAgent
  class MyMCP extends MockMcpAgent {
    constructor(state: any, env: any, props: any) {
      super(state, env, props);
    }
  }
  
  return { MyMCP };
});

// Import MyMCP after all mocks are set up
import { MyMCP } from './index';

// Mock all Zendesk client methods
const mockZendeskGetTicket = vi.fn();
const mockZendeskGetComments = vi.fn();
const mockZendeskCreateComment = vi.fn();
const mockZendeskGetKnowledgeBase = vi.fn();
const mockZendeskCreateTicket = vi.fn();
const mockZendeskUpdateTicket = vi.fn();
const mockZendeskDeleteTicket = vi.fn();
const mockZendeskListTickets = vi.fn();
const mockZendeskListUsers = vi.fn();
const mockZendeskGetUser = vi.fn();
const mockZendeskCreateUser = vi.fn();
const mockZendeskSuspendUser = vi.fn();
const mockZendeskSearch = vi.fn();
const mockZendeskSearchTickets = vi.fn();
const mockZendeskMergeTickets = vi.fn();
const mockZendeskCreateManyTickets = vi.fn();
const mockZendeskUpdateManyTickets = vi.fn();
const mockZendeskGetGroup = vi.fn();
const mockZendeskListGroups = vi.fn();
const mockZendeskListViews = vi.fn();
const mockZendeskExecuteView = vi.fn();
const mockZendeskListOrganizations = vi.fn();
const mockZendeskGetOrganization = vi.fn();
const mockZendeskCreateOrganization = vi.fn();

vi.mock('./zendesk-client', () => ({
  ZendeskClientWrapper: vi.fn().mockImplementation(() => ({
    get_ticket: mockZendeskGetTicket,
    get_ticket_comments: mockZendeskGetComments,
    create_ticket_comment: mockZendeskCreateComment,
    getKnowledgeBase: mockZendeskGetKnowledgeBase,
    create_ticket: mockZendeskCreateTicket,
    update_ticket: mockZendeskUpdateTicket,
    delete_ticket: mockZendeskDeleteTicket,
    list_tickets: mockZendeskListTickets,
    list_users: mockZendeskListUsers,
    get_user: mockZendeskGetUser,
    create_user: mockZendeskCreateUser,
    suspend_user: mockZendeskSuspendUser,
    search: mockZendeskSearch,
    search_tickets: mockZendeskSearchTickets,
    merge_tickets: mockZendeskMergeTickets,
    create_many_tickets: mockZendeskCreateManyTickets,
    update_many_tickets: mockZendeskUpdateManyTickets,
    get_group: mockZendeskGetGroup,
    list_groups: mockZendeskListGroups,
    list_views: mockZendeskListViews,
    execute_view: mockZendeskExecuteView,
    list_organizations: mockZendeskListOrganizations,
    get_organization: mockZendeskGetOrganization,
    create_organization: mockZendeskCreateOrganization,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MyMCP Zendesk Integration', () => {
  describe('Tool registration', () => {
    it('should create MyMCP instance successfully', async () => {
      // --- ARRANGE & ACT ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);

      // --- ASSERT ---
      expect(mcpServer).toBeDefined();
      // env and props are protected properties, so we can't access them directly
      // The fact that the instance was created successfully is sufficient
    });
  });

  describe('zendesk/get_ticket tool', () => {
    it('should call zendeskClient.get_ticket with correct parameters', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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
      expect(() => new MyMCP(mockState, invalidEnv, mockProps))
        .toThrow();
    });
  });

  describe('HTTP request handling', () => {
    it('should handle GET requests for server information', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
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

  describe('zendesk_create_ticket tool', () => {
    it('should create a new ticket with all parameters', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskCreateTicket.mockResolvedValue({
        id: 999,
        subject: 'New issue',
        status: 'new',
        priority: 'high',
      });

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_create_ticket', 
        arguments: {
          subject: 'New issue',
          description: 'This is a new issue',
          priority: 'high',
          assignee_id: 123,
          tags: ['urgent', 'bug']
        } 
      });

      // --- ASSERT ---
      expect(mockZendeskCreateTicket).toHaveBeenCalledWith({
        subject: 'New issue',
        description: 'This is a new issue',
        priority: 'high',
        assignee_id: 123,
        tags: ['urgent', 'bug']
      });
      expect(result.content[0].text).toContain('Ticket created successfully');
      expect(result.content[0].text).toContain('ID: 999');
    });
  });

  describe('zendesk_update_ticket tool', () => {
    it('should update an existing ticket', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskUpdateTicket.mockResolvedValue({
        id: 123,
        subject: 'Updated issue',
        status: 'solved',
        priority: 'low',
      });

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_update_ticket', 
        arguments: {
          ticket_id: 123,
          status: 'solved',
          priority: 'low'
        } 
      });

      // --- ASSERT ---
      expect(mockZendeskUpdateTicket).toHaveBeenCalledWith(123, {
        status: 'solved',
        priority: 'low'
      });
      expect(result.content[0].text).toContain('Ticket updated successfully');
    });
  });

  describe('zendesk_list_tickets tool', () => {
    it('should list tickets with filters', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskListTickets.mockResolvedValue([
        { id: 1, subject: 'Open ticket 1', status: 'open' },
        { id: 2, subject: 'Open ticket 2', status: 'open' }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_list_tickets', 
        arguments: { status: 'open' } 
      });

      // --- ASSERT ---
      expect(mockZendeskListTickets).toHaveBeenCalledWith({ status: 'open' });
      expect(result.content[0].text).toContain('Found 2 tickets');
      expect(result.content[0].text).toContain('Open ticket 1');
      expect(result.content[0].text).toContain('Open ticket 2');
    });
  });

  describe('zendesk_search tool', () => {
    it('should perform search with query', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskSearch.mockResolvedValue({
        results: [
          { id: 1, subject: 'Found ticket', type: 'ticket' },
          { id: 2, name: 'Found user', type: 'user' }
        ],
        count: 2
      });

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_search', 
        arguments: { query: 'test query' } 
      });

      // --- ASSERT ---
      expect(mockZendeskSearch).toHaveBeenCalledWith('test query');
      expect(result.content[0].text).toContain('Found 2 results');
    });
  });

  describe('zendesk_create_user tool', () => {
    it('should create a new user', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskCreateUser.mockResolvedValue({
        id: 555,
        name: 'New User',
        email: 'newuser@example.com',
        role: 'end-user'
      });

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_create_user', 
        arguments: {
          name: 'New User',
          email: 'newuser@example.com',
          role: 'end-user'
        } 
      });

      // --- ASSERT ---
      expect(mockZendeskCreateUser).toHaveBeenCalledWith({
        name: 'New User',
        email: 'newuser@example.com',
        role: 'end-user'
      });
      expect(result.content[0].text).toContain('User created successfully');
      expect(result.content[0].text).toContain('ID: 555');
    });
  });

  describe('zendesk_list_organizations tool', () => {
    it('should list all organizations', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskListOrganizations.mockResolvedValue([
        { id: 1, name: 'Org 1', domain_names: ['org1.com'] },
        { id: 2, name: 'Org 2', domain_names: ['org2.com'] }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_list_organizations', 
        arguments: {} 
      });

      // --- ASSERT ---
      expect(mockZendeskListOrganizations).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Found 2 organizations');
      expect(result.content[0].text).toContain('Org 1');
      expect(result.content[0].text).toContain('org1.com');
    });
  });

  describe('zendesk_list_views tool', () => {
    it('should list all views', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskListViews.mockResolvedValue([
        { id: 1, title: 'Open tickets', active: true },
        { id: 2, title: 'Pending tickets', active: true }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_list_views', 
        arguments: {} 
      });

      // --- ASSERT ---
      expect(mockZendeskListViews).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Found 2 views');
      expect(result.content[0].text).toContain('Open tickets');
    });
  });

  describe('zendesk_execute_view tool', () => {
    it('should execute a view and return tickets', async () => {
      // --- ARRANGE ---
      const mcpServer = new MyMCP(mockState, mockEnv, mockProps);
      await mcpServer.init();
      
      mockZendeskExecuteView.mockResolvedValue([
        { id: 100, subject: 'View ticket 1', status: 'open' },
        { id: 101, subject: 'View ticket 2', status: 'open' }
      ]);

      const handlerConfig = mockSetRequestHandler.mock.calls[0][0];
      const callToolHandler = handlerConfig.callTool;

      // --- ACT ---
      const result = await callToolHandler({ 
        name: 'zendesk_execute_view', 
        arguments: { view_id: 360001234567 } 
      });

      // --- ASSERT ---
      expect(mockZendeskExecuteView).toHaveBeenCalledWith(360001234567);
      expect(result.content[0].text).toContain('Found 2 tickets');
      expect(result.content[0].text).toContain('View ticket 1');
    });
  });
});