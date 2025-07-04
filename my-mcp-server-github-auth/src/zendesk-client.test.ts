import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZendeskClientWrapper } from './zendesk-client';

// Maak van tevoren mock-functies aan voor elke methode die we gaan aanroepen.
const mockShowTicket = vi.fn();
const mockGetComments = vi.fn();
const mockUpdateTicket = vi.fn();
const mockListSections = vi.fn();
const mockListArticles = vi.fn();

// Vertel Vitest: "Elke keer als code 'node-zendesk' importeert, geef dan DIT object terug."
vi.mock('node-zendesk', () => ({
  default: {
    createClient: vi.fn(() => ({
      tickets: {
        show: mockShowTicket,
        getComments: mockGetComments,
        update: mockUpdateTicket,
      },
      helpcenter: {
        sections: { list: mockListSections },
        articles: { listBySection: mockListArticles },
      },
    })),
  }
}));

// Een dummy 'env' object voor de constructor van onze wrapper.
const env = {
    ZENDESK_SUBDOMAIN: 'test-subdomain',
    ZENDESK_EMAIL: 'test@example.com',
    ZENDESK_API_KEY: 'test-api-key',
} as any;

// Zorg ervoor dat de mocks schoon zijn voor elke afzonderlijke test.
beforeEach(() => {
    vi.clearAllMocks();
});

describe('ZendeskClientWrapper', () => {
  describe('get_ticket', () => {
    it('should correctly call the Zendesk API and format the ticket data', async () => {
      // --- ARRANGE ---
      const mockApiResponse = { 
        result: { 
          id: 123, 
          subject: 'Help!', 
          description: 'It is broken.',
          priority: 'high',
          status: 'open',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        } 
      };
      mockShowTicket.mockResolvedValue(mockApiResponse);
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const ticket = await client.get_ticket(123);

      // --- ASSERT ---
      expect(mockShowTicket).toHaveBeenCalledTimes(1);
      expect(mockShowTicket).toHaveBeenCalledWith(123);
      expect(ticket.subject).toBe('Help!');
      expect(ticket.description).toBe('It is broken.');
      expect(ticket.priority).toBe('high');
      expect(ticket.status).toBe('open');
      // Test ook of je mapping werkt: overbodige velden moeten er niet zijn.
      expect(ticket).not.toHaveProperty('result'); 
    });

    it('should handle API errors gracefully', async () => {
      // --- ARRANGE ---
      mockShowTicket.mockRejectedValue(new Error('API Error'));
      const client = new ZendeskClientWrapper(env);

      // --- ACT & ASSERT ---
      await expect(client.get_ticket(123)).rejects.toThrow('API Error');
    });
  });

  describe('get_ticket_comments', () => {
    it('should fetch and format ticket comments correctly', async () => {
      // --- ARRANGE ---
      const mockApiResponse = {
        result: [
          { id: 1, body: 'First comment', public: true, created_at: '2024-01-01T00:00:00Z' },
          { id: 2, body: 'Second comment', public: false, created_at: '2024-01-02T00:00:00Z' }
        ]
      };
      mockGetComments.mockResolvedValue(mockApiResponse);
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const comments = await client.get_ticket_comments(456);

      // --- ASSERT ---
      expect(mockGetComments).toHaveBeenCalledTimes(1);
      expect(mockGetComments).toHaveBeenCalledWith(456);
      expect(comments).toHaveLength(2);
      expect(comments[0].body).toBe('First comment');
      expect(comments[1].public).toBe(false);
    });
  });

  describe('create_ticket_comment', () => {
    it('should correctly call the update API when creating a public comment', async () => {
      // --- ARRANGE ---
      mockUpdateTicket.mockResolvedValue({ result: 'ok' });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      await client.create_ticket_comment(456, 'This is a public comment', true);

      // --- ASSERT ---
      expect(mockUpdateTicket).toHaveBeenCalledTimes(1);
      expect(mockUpdateTicket).toHaveBeenCalledWith(456, {
        ticket: { comment: { body: 'This is a public comment', public: true } },
      });
    });

    it('should correctly call the update API when creating a private comment', async () => {
      // --- ARRANGE ---
      mockUpdateTicket.mockResolvedValue({ result: 'ok' });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      await client.create_ticket_comment(789, 'Internal note', false);

      // --- ASSERT ---
      expect(mockUpdateTicket).toHaveBeenCalledTimes(1);
      expect(mockUpdateTicket).toHaveBeenCalledWith(789, {
        ticket: { comment: { body: 'Internal note', public: false } },
      });
    });
  });

  describe('getKnowledgeBase', () => {
    it('should fetch and format knowledge base articles correctly', async () => {
      // --- ARRANGE ---
      mockListSections.mockResolvedValue([
        { id: 1, name: 'General', position: 1 },
        { id: 2, name: 'Technical', position: 2 }
      ]);
      mockListArticles.mockImplementation((sectionId) => {
        if (sectionId === 1) {
          return Promise.resolve([
            { id: 101, title: 'How to restart', body: 'Press the button...', position: 1 }
          ]);
        } else {
          return Promise.resolve([
            { id: 201, title: 'API Guide', body: 'Use the API...', position: 1 }
          ]);
        }
      });
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const knowledgeBase = await client.getKnowledgeBase();

      // --- ASSERT ---
      expect(mockListSections).toHaveBeenCalledTimes(1);
      expect(mockListArticles).toHaveBeenCalledTimes(2);
      expect(mockListArticles).toHaveBeenCalledWith(1);
      expect(mockListArticles).toHaveBeenCalledWith(2);
      
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
      mockListSections.mockResolvedValue([{ id: 1, name: 'General' }]);
      mockListArticles.mockResolvedValue([{ id: 101, title: 'How to restart' }]);
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      await client.getKnowledgeBase(); // Eerste aanroep vult de cache
      await client.getKnowledgeBase(); // Tweede aanroep zou uit de cache moeten komen
      await client.getKnowledgeBase(); // Derde aanroep ook

      // --- ASSERT ---
      // De daadwerkelijke API-aanroepen zouden maar ÉÉN keer mogen zijn gedaan.
      expect(mockListSections).toHaveBeenCalledTimes(1);
      expect(mockListArticles).toHaveBeenCalledTimes(1);
    });

    it('should handle empty sections gracefully', async () => {
      // --- ARRANGE ---
      mockListSections.mockResolvedValue([]);
      const client = new ZendeskClientWrapper(env);

      // --- ACT ---
      const knowledgeBase = await client.getKnowledgeBase();

      // --- ASSERT ---
      expect(knowledgeBase).toEqual([]);
      expect(mockListArticles).not.toHaveBeenCalled();
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