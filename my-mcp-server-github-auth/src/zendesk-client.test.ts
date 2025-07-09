import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZendeskClientWrapper } from './zendesk-client';

// Mock the global fetch function
global.fetch = vi.fn();

describe('ZendeskClientWrapper', () => {
  let client: ZendeskClientWrapper;
  const mockEnv = {
    ZENDESK_SUBDOMAIN: 'test-subdomain',
    ZENDESK_EMAIL: 'test@example.com',
    ZENDESK_API_KEY: 'test-api-key'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ZendeskClientWrapper(mockEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should create proper auth header with email/token format', () => {
      const expectedAuth = `Basic ${btoa('test@example.com/token:test-api-key')}`;
      expect(client.authHeader).toBe(expectedAuth);
    });

    it('should throw error if required env vars are missing', () => {
      expect(() => new ZendeskClientWrapper({} as any)).toThrow('Missing required Zendesk configuration');
    });
  });

  describe('get_ticket', () => {
    it('should make GET request to correct endpoint', async () => {
      const mockTicket = {
        id: 123,
        subject: 'Test ticket',
        description: 'Test description',
        status: 'open',
        priority: 'normal',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ticket: mockTicket })
      });

      const result = await client.get_ticket(123);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-subdomain.zendesk.com/api/v2/tickets/123.json',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': client.authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          })
        })
      );

      expect(result).toEqual({
        id: 123,
        subject: 'Test ticket',
        description: 'Test description',
        status: 'open',
        priority: 'normal',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });
    });

    it('should handle missing priority field', async () => {
      const mockTicket = {
        id: 123,
        subject: 'Test ticket',
        description: 'Test description',
        status: 'open',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ticket: mockTicket })
      });

      const result = await client.get_ticket(123);
      expect(result.priority).toBe('normal');
    });
  });

  describe('create_ticket', () => {
    it('should format comment from description field', async () => {
      const newTicket = {
        subject: 'New ticket',
        description: 'Problem description'
      };

      const mockResponse = {
        id: 456,
        subject: 'New ticket',
        description: 'Problem description',
        status: 'new',
        priority: 'normal',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ticket: mockResponse })
      });

      await client.create_ticket(newTicket);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-subdomain.zendesk.com/api/v2/tickets.json',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ticket: {
              subject: 'New ticket',
              comment: { body: 'Problem description' }
            }
          })
        })
      );
    });

    it('should prefer comment over description if both provided', async () => {
      const newTicket = {
        subject: 'New ticket',
        description: 'This should be ignored',
        comment: 'This is the actual comment'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ticket: { id: 456 } })
      });

      await client.create_ticket(newTicket);

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.ticket.comment).toEqual({ body: 'This is the actual comment' });
      // The description field should still be there because we pass the whole object
      // Only when description is used to create a comment should it be removed
      expect(callBody.ticket.description).toBe('This should be ignored');
    });

    it('should include optional fields when provided', async () => {
      const newTicket = {
        subject: 'New ticket',
        comment: 'Problem description',
        priority: 'high',
        assignee_id: 789,
        group_id: 101,
        tags: ['urgent', 'bug'],
        custom_fields: [{ id: 1, value: 'custom' }]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ticket: { id: 456 } })
      });

      await client.create_ticket(newTicket);

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.ticket).toMatchObject({
        subject: 'New ticket',
        comment: { body: 'Problem description' },
        priority: 'high',
        assignee_id: 789,
        group_id: 101,
        tags: ['urgent', 'bug'],
        custom_fields: [{ id: 1, value: 'custom' }]
      });
    });
  });

  describe('Error handling', () => {
    it('should parse and throw detailed error message from JSON response', async () => {
      const errorResponse = {
        error: 'RecordNotFound',
        description: 'The requested resource could not be found'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify(errorResponse)
      });

      await expect(client.get_ticket(99999)).rejects.toThrow(
        'Zendesk API Error (404): RecordNotFound'
      );
    });

    it('should handle error response with details field', async () => {
      const errorResponse = {
        details: {
          base: [{ description: 'Validation failed' }]
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => JSON.stringify(errorResponse)
      });

      await expect(client.create_ticket({ subject: '' } as any)).rejects.toThrow(
        'Zendesk API Error (422): {"base":[{"description":"Validation failed"}]}'
      );
    });

    it('should handle non-JSON error response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      await expect(client.get_ticket(123)).rejects.toThrow(
        'Zendesk API Error (500): Internal Server Error'
      );
    });
  });

  describe('Bulk operations', () => {
    describe('create_many_tickets', () => {
      it('should format multiple tickets correctly', async () => {
        const tickets = [
          { subject: 'Ticket 1', description: 'Description 1' },
          { subject: 'Ticket 2', comment: 'Comment 2' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ job_status: { id: 'job123', status: 'queued' } })
        });

        const result = await client.create_many_tickets(tickets);

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.tickets).toHaveLength(2);
        expect(callBody.tickets[0]).toEqual({
          subject: 'Ticket 1',
          comment: { body: 'Description 1' }
        });
        expect(callBody.tickets[1]).toEqual({
          subject: 'Ticket 2',
          comment: { body: 'Comment 2' }
        });

        expect(result.job_status).toEqual({ id: 'job123', status: 'queued' });
      });
    });

    describe('merge_tickets', () => {
      it('should send correct merge request', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ job_status: { id: 'job456', status: 'queued' } })
        });

        await client.merge_tickets(100, 200, 'Merging duplicate');

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/tickets/merge.json',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              ids: [100],
              target_ticket_id: 200,
              target_comment: 'Merging duplicate'
            })
          })
        );
      });
    });
  });

  describe('User operations', () => {
    describe('suspend_user', () => {
      it('should update user with suspended flag', async () => {
        const mockUser = {
          id: 789,
          name: 'Test User',
          email: 'user@example.com',
          role: 'end-user',
          verified: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: mockUser })
        });

        const result = await client.suspend_user(789);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/789.json',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              user: { suspended: true }
            })
          })
        );

        expect(result).toMatchObject(mockUser);
      });
    });
  });

  describe('Search operations', () => {
    it('should encode search query properly', async () => {
      const query = 'status:open type:ticket assignee:"John Doe"';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          count: 0
        })
      });

      await client.search(query);

      const expectedUrl = `https://test-subdomain.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}`;
      expect(global.fetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.any(Object)
      );
    });

    it('should add type prefix for specialized searches', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 1, subject: 'Test' }],
          count: 1
        })
      });

      await client.search_tickets('priority:high');

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain(encodeURIComponent('type:ticket priority:high'));
    });
  });
});