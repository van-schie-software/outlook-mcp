import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZendeskClientWrapper } from './zendesk-client';

// Mock the global fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock btoa for base64 encoding
global.btoa = (str: string) => Buffer.from(str).toString('base64');

// Een dummy 'env' object voor de constructor van onze wrapper.
const env = {
    ZENDESK_SUBDOMAIN: 'test-subdomain',
    ZENDESK_EMAIL: 'test@example.com',
    ZENDESK_API_KEY: 'test-api-key',
} as any;

// Zorg ervoor dat de mocks schoon zijn voor elke afzonderlijke test.
beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
});

describe('ZendeskClientWrapper', () => {
  describe('get_ticket', () => {
    it('should correctly call the Zendesk API and format the ticket data', async () => {
      // --- ARRANGE ---
      const mockApiResponse = { 
        ticket: { 
          id: 123, 
          subject: 'Help!', 
          description: 'It is broken.',
          priority: 'high',
          status: 'open',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        } 
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const ticket = await client.get_ticket(123);

      // --- ASSERT ---
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-subdomain.zendesk.com/api/v2/tickets/123.json',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
          })
        })
      );
      expect(ticket.subject).toBe('Help!');
      expect(ticket.description).toBe('It is broken.');
      expect(ticket.priority).toBe('high');
      expect(ticket.status).toBe('open');
    });

    it('should handle API errors gracefully', async () => {
      // --- ARRANGE ---
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Ticket not found',
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT & ASSERT ---
      await expect(client.get_ticket(123)).rejects.toThrow('Zendesk API error (404): Ticket not found');
    });
  });

  describe('get_ticket_comments', () => {
    it('should fetch and format ticket comments correctly', async () => {
      // --- ARRANGE ---
      const mockApiResponse = {
        comments: [
          { id: 1, body: 'First comment', public: true, created_at: '2024-01-01T00:00:00Z' },
          { id: 2, body: 'Second comment', public: false, created_at: '2024-01-02T00:00:00Z' }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const comments = await client.get_ticket_comments(456);

      // --- ASSERT ---
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-subdomain.zendesk.com/api/v2/tickets/456/comments.json',
        expect.any(Object)
      );
      expect(comments).toHaveLength(2);
      expect(comments[0].body).toBe('First comment');
      expect(comments[1].public).toBe(false);
    });
  });

  describe('create_ticket_comment', () => {
    it('should correctly call the update API when creating a public comment', async () => {
      // --- ARRANGE ---
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'ok' }),
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      await client.create_ticket_comment(456, 'This is a public comment', true);

      // --- ASSERT ---
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-subdomain.zendesk.com/api/v2/tickets/456.json',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            ticket: { comment: { body: 'This is a public comment', public: true } },
          })
        })
      );
    });

    it('should correctly call the update API when creating a private comment', async () => {
      // --- ARRANGE ---
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'ok' }),
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      await client.create_ticket_comment(789, 'Internal note', false);

      // --- ASSERT ---
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-subdomain.zendesk.com/api/v2/tickets/789.json',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            ticket: { comment: { body: 'Internal note', public: false } },
          })
        })
      );
    });
  });

  describe('getKnowledgeBase', () => {
    it('should fetch and format knowledge base articles correctly', async () => {
      // --- ARRANGE ---
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sections: [
              { id: 1, name: 'General', position: 1 },
              { id: 2, name: 'Technical', position: 2 }
            ]
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            articles: [
              { id: 101, title: 'How to restart', body: 'Press the button...', position: 1 }
            ]
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            articles: [
              { id: 201, title: 'API Guide', body: 'Use the API...', position: 1 }
            ]
          }),
        });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const knowledgeBase = await client.getKnowledgeBase();

      // --- ASSERT ---
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(1,
        'https://test-subdomain.zendesk.com/api/v2/help_center/sections.json',
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        'https://test-subdomain.zendesk.com/api/v2/help_center/sections/1/articles.json',
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(3,
        'https://test-subdomain.zendesk.com/api/v2/help_center/sections/2/articles.json',
        expect.any(Object)
      );
      
      expect(knowledgeBase).toHaveLength(2);
      expect(knowledgeBase[0].name).toBe('General');
      expect(knowledgeBase[0].articles).toHaveLength(1);
      expect(knowledgeBase[0].articles[0].title).toBe('How to restart');
      
      expect(knowledgeBase[1].name).toBe('Technical');
      expect(knowledgeBase[1].articles).toHaveLength(1);
      expect(knowledgeBase[1].articles[0].title).toBe('API Guide');
    });

    it('should cache the knowledge base after the first call', async () => {
      // --- ARRANGE ---
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sections: [{ id: 1, name: 'General' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ articles: [{ id: 101, title: 'How to restart' }] }),
        });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      await client.getKnowledgeBase(); // Eerste aanroep vult de cache
      await client.getKnowledgeBase(); // Tweede aanroep zou uit de cache moeten komen
      await client.getKnowledgeBase(); // Derde aanroep ook

      // --- ASSERT ---
      // De daadwerkelijke API-aanroepen zouden maar 2 keer mogen zijn gedaan (sections + articles).
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle empty sections gracefully', async () => {
      // --- ARRANGE ---
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const knowledgeBase = await client.getKnowledgeBase();

      // --- ASSERT ---
      expect(knowledgeBase).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only sections call, no articles
    });
  });

  describe('constructor', () => {
    it('should validate required environment variables', () => {
      // --- ARRANGE ---
      const invalidEnv = {
        ZENDESK_SUBDOMAIN: 'test',
        // Missing ZENDESK_EMAIL and ZENDESK_API_KEY
      } as any;

      // --- ACT & ASSERT ---
      expect(() => new ZendeskClientWrapper(invalidEnv)).toThrow();
    });
  });
});