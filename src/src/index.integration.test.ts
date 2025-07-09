import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

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

// Create a mock Zendesk client
const mockZendeskClient = {
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
};

vi.mock('./zendesk-client', () => ({
  ZendeskClientWrapper: vi.fn().mockImplementation(() => mockZendeskClient),
}));

// Test environment
const testEnv = {
  ZENDESK_SUBDOMAIN: 'test-subdomain',
  ZENDESK_EMAIL: 'test@example.com',
  ZENDESK_API_KEY: 'test-api-key',
};

// Helper to create a tool handler context
const createContext = () => ({
  getZendeskClient: () => mockZendeskClient,
  env: testEnv,
});

// Helper to define a tool (mimicking the server.tool method)
const defineTool = (name: string, description: string, schema: any, handler: Function) => ({
  name,
  description,
  inputSchema: schema,
  handler: handler.bind(createContext()),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Zendesk MCP Tools - Integration Tests', () => {
  describe('Ticket Tools', () => {
    describe('zendesk/get_ticket', () => {
      it('should fetch ticket successfully', async () => {
        // Arrange
        const mockTicket = {
          id: 789,
          subject: 'Test Ticket',
          description: 'Test Description',
          status: 'open',
          priority: 'high',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
        };
        mockZendeskGetTicket.mockResolvedValue(mockTicket);

        // Define the tool
        const tool = defineTool(
          'zendesk/get_ticket',
          'Get a specific Zendesk ticket by ID',
          { id: z.number().describe('The ticket ID') },
          async function({ id }: { id: number }) {
            const ticket = await this.getZendeskClient().get_ticket(id);
            return {
              content: [{
                type: 'text',
                text: `# Ticket #${ticket.id}: ${ticket.subject}\n\n**Status:** ${ticket.status}\n**Priority:** ${ticket.priority}\n**Created:** ${ticket.created_at}\n**Updated:** ${ticket.updated_at}\n\n## Description\n${ticket.description}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({ id: 789 });

        // Assert
        expect(mockZendeskGetTicket).toHaveBeenCalledWith(789);
        expect(result.content[0].text).toContain('Ticket #789: Test Ticket');
        expect(result.content[0].text).toContain('**Status:** open');
        expect(result.content[0].text).toContain('**Priority:** high');
      });

      it('should handle errors gracefully', async () => {
        // Arrange
        mockZendeskGetTicket.mockRejectedValue(new Error('Ticket not found'));

        const tool = defineTool(
          'zendesk/get_ticket',
          'Get a specific Zendesk ticket by ID',
          { id: z.number() },
          async function({ id }: { id: number }) {
            try {
              const ticket = await this.getZendeskClient().get_ticket(id);
              return { content: [{ type: 'text', text: `Ticket: ${ticket.subject}` }] };
            } catch (error: any) {
              return {
                content: [{
                  type: 'text',
                  text: `Error: ${error.message}`
                }],
                isError: true
              };
            }
          }
        );

        // Act
        const result = await tool.handler({ id: 999 });

        // Assert
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error: Ticket not found');
      });
    });

    describe('zendesk_create_ticket', () => {
      it('should create a new ticket', async () => {
        // Arrange
        const newTicket = {
          id: 1000,
          subject: 'New Issue',
          status: 'new',
          priority: 'normal',
        };
        mockZendeskCreateTicket.mockResolvedValue(newTicket);

        const tool = defineTool(
          'zendesk_create_ticket',
          'Create a new Zendesk ticket',
          {
            subject: z.string(),
            description: z.string().optional(),
            priority: z.string().optional(),
          },
          async function(ticketData: any) {
            const ticket = await this.getZendeskClient().create_ticket(ticketData);
            return {
              content: [{
                type: 'text',
                text: `Ticket created successfully!\nID: ${ticket.id}\nSubject: ${ticket.subject}\nStatus: ${ticket.status}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({
          subject: 'New Issue',
          description: 'Description of the issue',
          priority: 'normal'
        });

        // Assert
        expect(mockZendeskCreateTicket).toHaveBeenCalledWith({
          subject: 'New Issue',
          description: 'Description of the issue',
          priority: 'normal'
        });
        expect(result.content[0].text).toContain('Ticket created successfully!');
        expect(result.content[0].text).toContain('ID: 1000');
      });
    });

    describe('zendesk_list_tickets', () => {
      it('should list tickets with filters', async () => {
        // Arrange
        const tickets = [
          { id: 1, subject: 'Ticket 1', status: 'open' },
          { id: 2, subject: 'Ticket 2', status: 'open' }
        ];
        mockZendeskListTickets.mockResolvedValue(tickets);

        const tool = defineTool(
          'zendesk_list_tickets',
          'List Zendesk tickets',
          { status: z.string().optional() },
          async function(filters: any) {
            const tickets = await this.getZendeskClient().list_tickets(filters);
            if (tickets.length === 0) {
              return { content: [{ type: 'text', text: 'No tickets found' }] };
            }
            
            const ticketsList = tickets
              .map((t: any) => `- #${t.id}: ${t.subject} (${t.status})`)
              .join('\n');
            
            return {
              content: [{
                type: 'text',
                text: `Found ${tickets.length} tickets:\n\n${ticketsList}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({ status: 'open' });

        // Assert
        expect(mockZendeskListTickets).toHaveBeenCalledWith({ status: 'open' });
        expect(result.content[0].text).toContain('Found 2 tickets');
        expect(result.content[0].text).toContain('- #1: Ticket 1 (open)');
        expect(result.content[0].text).toContain('- #2: Ticket 2 (open)');
      });

      it('should handle empty results', async () => {
        // Arrange
        mockZendeskListTickets.mockResolvedValue([]);

        const tool = defineTool(
          'zendesk_list_tickets',
          'List Zendesk tickets',
          {},
          async function() {
            const tickets = await this.getZendeskClient().list_tickets();
            if (tickets.length === 0) {
              return { content: [{ type: 'text', text: 'No tickets found' }] };
            }
            return { content: [{ type: 'text', text: `Found ${tickets.length} tickets` }] };
          }
        );

        // Act
        const result = await tool.handler({});

        // Assert
        expect(result.content[0].text).toBe('No tickets found');
      });
    });
  });

  describe('User Tools', () => {
    describe('zendesk_list_users', () => {
      it('should list all users', async () => {
        // Arrange
        const users = [
          { id: 1, name: 'User 1', email: 'user1@example.com', role: 'agent' },
          { id: 2, name: 'User 2', email: 'user2@example.com', role: 'end-user' }
        ];
        mockZendeskListUsers.mockResolvedValue(users);

        const tool = defineTool(
          'zendesk_list_users',
          'List all Zendesk users',
          {},
          async function() {
            const users = await this.getZendeskClient().list_users();
            const usersList = users
              .map((u: any) => `- ${u.name} (${u.email}) - ${u.role}`)
              .join('\n');
            
            return {
              content: [{
                type: 'text',
                text: `Found ${users.length} users:\n\n${usersList}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({});

        // Assert
        expect(mockZendeskListUsers).toHaveBeenCalled();
        expect(result.content[0].text).toContain('Found 2 users');
        expect(result.content[0].text).toContain('- User 1 (user1@example.com) - agent');
      });
    });

    describe('zendesk_create_user', () => {
      it('should create a new user', async () => {
        // Arrange
        const newUser = {
          id: 999,
          name: 'New User',
          email: 'newuser@example.com',
          role: 'end-user'
        };
        mockZendeskCreateUser.mockResolvedValue(newUser);

        const tool = defineTool(
          'zendesk_create_user',
          'Create a new Zendesk user',
          {
            name: z.string(),
            email: z.string(),
            role: z.string().optional(),
          },
          async function(userData: any) {
            const user = await this.getZendeskClient().create_user(userData);
            return {
              content: [{
                type: 'text',
                text: `User created successfully!\nID: ${user.id}\nName: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({
          name: 'New User',
          email: 'newuser@example.com',
          role: 'end-user'
        });

        // Assert
        expect(mockZendeskCreateUser).toHaveBeenCalledWith({
          name: 'New User',
          email: 'newuser@example.com',
          role: 'end-user'
        });
        expect(result.content[0].text).toContain('User created successfully!');
        expect(result.content[0].text).toContain('ID: 999');
      });
    });
  });

  describe('Search Tools', () => {
    describe('zendesk_search', () => {
      it('should perform search and return results', async () => {
        // Arrange
        const searchResults = {
          results: [
            { id: 1, subject: 'Found ticket', type: 'ticket' },
            { id: 2, name: 'Found user', type: 'user' }
          ],
          count: 2
        };
        mockZendeskSearch.mockResolvedValue(searchResults);

        const tool = defineTool(
          'zendesk_search',
          'Search across Zendesk',
          { query: z.string() },
          async function({ query }: { query: string }) {
            const results = await this.getZendeskClient().search(query);
            if (results.count === 0) {
              return { content: [{ type: 'text', text: 'No results found' }] };
            }
            
            return {
              content: [{
                type: 'text',
                text: `Found ${results.count} results for "${query}"`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({ query: 'test query' });

        // Assert
        expect(mockZendeskSearch).toHaveBeenCalledWith('test query');
        expect(result.content[0].text).toContain('Found 2 results for "test query"');
      });
    });
  });

  describe('Organization Tools', () => {
    describe('zendesk_list_organizations', () => {
      it('should list all organizations', async () => {
        // Arrange
        const orgs = [
          { id: 1, name: 'Org 1', domain_names: ['org1.com'] },
          { id: 2, name: 'Org 2', domain_names: ['org2.com'] }
        ];
        mockZendeskListOrganizations.mockResolvedValue(orgs);

        const tool = defineTool(
          'zendesk_list_organizations',
          'List all organizations',
          {},
          async function() {
            const orgs = await this.getZendeskClient().list_organizations();
            const orgsList = orgs
              .map((o: any) => `- ${o.name} (${o.domain_names.join(', ')})`)
              .join('\n');
            
            return {
              content: [{
                type: 'text',
                text: `Found ${orgs.length} organizations:\n\n${orgsList}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({});

        // Assert
        expect(mockZendeskListOrganizations).toHaveBeenCalled();
        expect(result.content[0].text).toContain('Found 2 organizations');
        expect(result.content[0].text).toContain('- Org 1 (org1.com)');
      });
    });
  });

  describe('Knowledge Base Tools', () => {
    describe('zendesk/search_knowledge_base', () => {
      it('should search knowledge base and return matching articles', async () => {
        // Arrange
        const knowledgeBase = [
          {
            id: 1,
            name: 'General',
            articles: [
              { id: 101, title: 'How to restart', body: 'Press the restart button.' },
              { id: 102, title: 'Login issues', body: 'Reset your password.' }
            ]
          }
        ];
        mockZendeskGetKnowledgeBase.mockResolvedValue(knowledgeBase);

        const tool = defineTool(
          'zendesk/search_knowledge_base',
          'Search knowledge base',
          { query: z.string() },
          async function({ query }: { query: string }) {
            const sections = await this.getZendeskClient().getKnowledgeBase();
            const results: any[] = [];
            
            sections.forEach((section: any) => {
              section.articles.forEach((article: any) => {
                if (article.title.toLowerCase().includes(query.toLowerCase()) ||
                    article.body.toLowerCase().includes(query.toLowerCase())) {
                  results.push(article);
                }
              });
            });
            
            if (results.length === 0) {
              return { content: [{ type: 'text', text: 'No articles found' }] };
            }
            
            const articlesList = results
              .map((a: any) => `**${a.title}**\n${a.body}`)
              .join('\n\n');
            
            return {
              content: [{
                type: 'text',
                text: `Found ${results.length} articles:\n\n${articlesList}`
              }]
            };
          }
        );

        // Act
        const result = await tool.handler({ query: 'restart' });

        // Assert
        expect(mockZendeskGetKnowledgeBase).toHaveBeenCalled();
        expect(result.content[0].text).toContain('Found 1 articles');
        expect(result.content[0].text).toContain('How to restart');
        expect(result.content[0].text).toContain('Press the restart button');
      });
    });
  });
});