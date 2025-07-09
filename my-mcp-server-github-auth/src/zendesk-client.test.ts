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

    it('should handle network failures', async () => {
      // Mock a network error
      const networkError = new Error('Network request failed');
      (global.fetch as any).mockRejectedValueOnce(networkError);

      // Verify that the method passes through the original error
      await expect(client.get_ticket(99999)).rejects.toThrow('Network request failed');
    });

    it('should handle timeout errors', async () => {
      // Mock a timeout error
      const timeoutError = new Error('Request timeout');
      (global.fetch as any).mockRejectedValueOnce(timeoutError);

      await expect(client.list_tickets()).rejects.toThrow('Request timeout');
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

  describe('Ticket operations - Extended', () => {
    describe('list_tickets', () => {
      it('should list all tickets without filters', async () => {
        const mockTickets = [
          { id: 1, subject: 'Ticket 1', status: 'open' },
          { id: 2, subject: 'Ticket 2', status: 'pending' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tickets: mockTickets })
        });

        const result = await client.list_tickets();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/tickets.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].priority).toBe('normal'); // Default priority
      });

      it('should apply filters when provided', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tickets: [] })
        });

        await client.list_tickets({ 
          status: 'open', 
          assignee_id: 123,
          requester_id: 456 
        });

        const callUrl = (global.fetch as any).mock.calls[0][0];
        expect(callUrl).toContain('status=open');
        expect(callUrl).toContain('assignee_id=123');
        expect(callUrl).toContain('requester_id=456');
      });
    });

    describe('update_ticket', () => {
      it('should update ticket with provided fields', async () => {
        const updates = { status: 'solved', priority: 'high' };
        const updatedTicket = {
          id: 123,
          subject: 'Test',
          status: 'solved',
          priority: 'high',
          created_at: '2024-01-01',
          updated_at: '2024-01-02'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ticket: updatedTicket })
        });

        const result = await client.update_ticket(123, updates);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/tickets/123.json',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ ticket: updates })
          })
        );
        expect(result.status).toBe('solved');
        expect(result.priority).toBe('high');
      });
    });

    describe('delete_ticket', () => {
      it('should send DELETE request to correct endpoint', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        });

        await client.delete_ticket(123);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/tickets/123.json',
          expect.objectContaining({
            method: 'DELETE'
          })
        );
      });
    });

    describe('list_user_tickets', () => {
      it('should fetch tickets for specific user', async () => {
        const userTickets = [
          { id: 10, subject: 'User ticket 1' },
          { id: 11, subject: 'User ticket 2' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tickets: userTickets })
        });

        const result = await client.list_user_tickets(789);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/789/tickets/requested.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
      });
    });

    describe('list_organization_tickets', () => {
      it('should fetch tickets for specific organization', async () => {
        const orgTickets = [
          { id: 20, subject: 'Org ticket 1' },
          { id: 21, subject: 'Org ticket 2' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tickets: orgTickets })
        });

        const result = await client.list_organization_tickets(999);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/organizations/999/tickets.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
      });
    });
  });

  describe('User operations - Extended', () => {
    describe('list_users', () => {
      it('should list all users', async () => {
        const mockUsers = [
          { id: 1, name: 'User 1', email: 'user1@example.com', role: 'agent' },
          { id: 2, name: 'User 2', email: 'user2@example.com', role: 'end-user' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: mockUsers })
        });

        const result = await client.list_users();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].verified).toBe(false); // Default verified status
      });
    });

    describe('get_user', () => {
      it('should fetch specific user details', async () => {
        const mockUser = {
          id: 123,
          name: 'John Doe',
          email: 'john@example.com',
          role: 'agent',
          verified: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          organization_id: 456
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: mockUser })
        });

        const result = await client.get_user(123);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/123.json',
          expect.any(Object)
        );
        expect(result).toMatchObject(mockUser);
      });
    });

    describe('get_current_user', () => {
      it('should fetch authenticated user details', async () => {
        const currentUser = {
          id: 999,
          name: 'Current User',
          email: 'current@example.com',
          role: 'admin'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: currentUser })
        });

        const result = await client.get_current_user();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/me.json',
          expect.any(Object)
        );
        expect(result.id).toBe(999);
      });
    });

    describe('create_user', () => {
      it('should create new user with provided data', async () => {
        const newUserData = {
          name: 'New User',
          email: 'newuser@example.com',
          role: 'end-user'
        };

        const createdUser = {
          id: 777,
          ...newUserData,
          verified: false,
          created_at: '2024-01-01',
          updated_at: '2024-01-01'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: createdUser })
        });

        const result = await client.create_user(newUserData);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users.json',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ user: newUserData })
          })
        );
        expect(result.id).toBe(777);
      });
    });

    describe('update_user', () => {
      it('should update user with provided fields', async () => {
        const updates = { name: 'Updated Name', role: 'agent' };
        const updatedUser = {
          id: 123,
          name: 'Updated Name',
          email: 'user@example.com',
          role: 'agent',
          verified: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-02'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: updatedUser })
        });

        const result = await client.update_user(123, updates);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/123.json',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ user: updates })
          })
        );
        expect(result.name).toBe('Updated Name');
        expect(result.role).toBe('agent');
      });
    });

    describe('delete_user', () => {
      it('should send DELETE request to correct endpoint', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        });

        await client.delete_user(123);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/123.json',
          expect.objectContaining({
            method: 'DELETE'
          })
        );
      });
    });

    describe('unsuspend_user', () => {
      it('should update user with suspended false flag', async () => {
        const unsuspendedUser = {
          id: 789,
          name: 'Test User',
          email: 'user@example.com',
          role: 'end-user',
          verified: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-02'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: unsuspendedUser })
        });

        const result = await client.unsuspend_user(789);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/users/789.json',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              user: { suspended: false }
            })
          })
        );
        expect(result).toMatchObject(unsuspendedUser);
      });
    });
  });

  describe('Organization operations', () => {
    describe('list_organizations', () => {
      it('should list all organizations', async () => {
        const mockOrgs = [
          { id: 1, name: 'Org 1', domain_names: ['org1.com'], created_at: '2024-01-01' },
          { id: 2, name: 'Org 2', domain_names: ['org2.com'], created_at: '2024-01-02' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organizations: mockOrgs })
        });

        const result = await client.list_organizations();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/organizations.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Org 1');
      });
    });

    describe('get_organization', () => {
      it('should fetch specific organization', async () => {
        const mockOrg = {
          id: 100,
          name: 'Test Organization',
          domain_names: ['test.com', 'test.org'],
          details: 'Test org details',
          notes: 'Important notes',
          created_at: '2024-01-01',
          updated_at: '2024-01-02'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organization: mockOrg })
        });

        const result = await client.get_organization(100);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/organizations/100.json',
          expect.any(Object)
        );
        expect(result).toMatchObject({
          id: mockOrg.id,
          name: mockOrg.name,
          domain_names: mockOrg.domain_names,
          created_at: mockOrg.created_at,
          updated_at: mockOrg.updated_at
        });
      });
    });

    describe('create_organization', () => {
      it('should create new organization', async () => {
        const newOrgData = {
          name: 'New Organization',
          domain_names: ['neworg.com']
        };

        const createdOrg = {
          id: 500,
          ...newOrgData,
          created_at: '2024-01-01',
          updated_at: '2024-01-01'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organization: createdOrg })
        });

        const result = await client.create_organization(newOrgData);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/organizations.json',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ organization: newOrgData })
          })
        );
        expect(result.id).toBe(500);
      });
    });

    describe('update_organization', () => {
      it('should update organization with provided fields', async () => {
        const updates = { name: 'Updated Org Name', notes: 'Updated notes' };
        const updatedOrg = {
          id: 100,
          name: 'Updated Org Name',
          domain_names: ['test.com'],
          notes: 'Updated notes',
          created_at: '2024-01-01',
          updated_at: '2024-01-03'
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organization: updatedOrg })
        });

        const result = await client.update_organization(100, updates);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/organizations/100.json',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ organization: updates })
          })
        );
        expect(result.name).toBe('Updated Org Name');
        // Note: The API only returns specific fields, not all fields
      });
    });

    describe('delete_organization', () => {
      it('should send DELETE request to correct endpoint', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        });

        await client.delete_organization(100);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/organizations/100.json',
          expect.objectContaining({
            method: 'DELETE'
          })
        );
      });
    });

    // Note: list_organization_users method does not exist in the current implementation
  });

  describe('Group operations', () => {
    describe('list_groups', () => {
      it('should list all groups', async () => {
        const mockGroups = [
          { id: 1, name: 'Support Team', description: 'First line support', created_at: '2024-01-01', updated_at: '2024-01-02' },
          { id: 2, name: 'Dev Team', description: 'Development support', created_at: '2024-01-01', updated_at: '2024-01-02' }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ groups: mockGroups })
        });

        const result = await client.list_groups();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/groups.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Support Team');
      });
    });

    describe('get_group', () => {
      it('should fetch specific group', async () => {
        const mockGroup = {
          id: 50,
          name: 'VIP Support',
          description: 'Premium customer support',
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          default: false,
          deleted: false
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ group: mockGroup })
        });

        const result = await client.get_group(50);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/groups/50.json',
          expect.any(Object)
        );
        expect(result).toMatchObject({
          id: mockGroup.id,
          name: mockGroup.name,
          description: mockGroup.description,
          created_at: mockGroup.created_at,
          updated_at: mockGroup.updated_at
        });
      });
    });
  });

  describe('Macro operations', () => {
    describe('list_macros', () => {
      it('should list all macros', async () => {
        const mockMacros = [
          { id: 1, title: 'Close ticket', active: true },
          { id: 2, title: 'Escalate to L2', active: true }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ macros: mockMacros })
        });

        const result = await client.list_macros();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/macros.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Close ticket');
      });
    });

    describe('get_macro', () => {
      it('should fetch specific macro', async () => {
        const mockMacro = {
          id: 123,
          title: 'Customer Satisfaction',
          active: true,
          description: 'Satisfaction macro',
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          actions: [
            { field: 'status', value: 'solved' },
            { field: 'comment_value', value: 'Thank you for contacting us!' }
          ]
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ macro: mockMacro })
        });

        const result = await client.get_macro(123);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/macros/123.json',
          expect.any(Object)
        );
        expect(result).toMatchObject({
          id: mockMacro.id,
          title: mockMacro.title,
          active: mockMacro.active,
          description: mockMacro.description,
          created_at: mockMacro.created_at,
          updated_at: mockMacro.updated_at
        });
        // Note: actions field is not returned in the simplified response
      });
    });
  });

  describe('View operations', () => {
    describe('list_views', () => {
      it('should list all views', async () => {
        const mockViews = [
          { id: 1, title: 'Open tickets', active: true },
          { id: 2, title: 'Pending tickets', active: true }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ views: mockViews })
        });

        const result = await client.list_views();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/views.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Open tickets');
      });
    });

    describe('get_view', () => {
      it('should fetch specific view', async () => {
        const mockView = {
          id: 360001234567,
          title: 'Unassigned tickets',
          active: true,
          description: 'View for unassigned tickets',
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          position: 1,
          conditions: {
            all: [
              { field: 'status', operator: 'less_than', value: 'solved' },
              { field: 'assignee_id', operator: 'is', value: null }
            ]
          }
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ view: mockView })
        });

        const result = await client.get_view(360001234567);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/views/360001234567.json',
          expect.any(Object)
        );
        expect(result).toMatchObject({
          id: mockView.id,
          title: mockView.title,
          active: mockView.active,
          description: mockView.description,
          created_at: mockView.created_at,
          updated_at: mockView.updated_at
        });
      });
    });

    describe('execute_view', () => {
      it('should execute view and return tickets', async () => {
        const viewTickets = [
          { id: 100, subject: 'Unassigned 1', assignee_id: null },
          { id: 101, subject: 'Unassigned 2', assignee_id: null }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tickets: viewTickets })
        });

        const result = await client.execute_view(360001234567);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/views/360001234567/tickets.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].priority).toBe('normal'); // Default priority
      });
    });
  });

  describe('Trigger operations', () => {
    describe('list_triggers', () => {
      it('should list all triggers', async () => {
        const mockTriggers = [
          { id: 1, title: 'Auto-assign VIP', active: true },
          { id: 2, title: 'Notify on urgent', active: false }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ triggers: mockTriggers })
        });

        const result = await client.list_triggers();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/triggers.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Auto-assign VIP');
      });
    });

    describe('get_trigger', () => {
      it('should fetch specific trigger', async () => {
        const mockTrigger = {
          id: 999,
          title: 'Escalation trigger',
          active: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          conditions: {
            all: [{ field: 'priority', operator: 'is', value: 'urgent' }]
          },
          actions: [{ field: 'group_id', value: '12345' }]
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ trigger: mockTrigger })
        });

        const result = await client.get_trigger(999);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/triggers/999.json',
          expect.any(Object)
        );
        expect(result).toMatchObject({
          id: mockTrigger.id,
          title: mockTrigger.title,
          active: mockTrigger.active,
          created_at: mockTrigger.created_at,
          updated_at: mockTrigger.updated_at
        });
      });
    });
  });

  describe('Automation operations', () => {
    describe('list_automations', () => {
      it('should list all automations', async () => {
        const mockAutomations = [
          { id: 1, title: 'Close old tickets', active: true },
          { id: 2, title: 'Send reminders', active: true }
        ];

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ automations: mockAutomations })
        });

        const result = await client.list_automations();

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/automations.json',
          expect.any(Object)
        );
        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Close old tickets');
      });
    });

    describe('get_automation', () => {
      it('should fetch specific automation', async () => {
        const mockAutomation = {
          id: 888,
          title: 'Weekend notification',
          active: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          conditions: {
            all: [{ field: 'update_type', operator: 'is', value: 'Create' }]
          },
          actions: [{ field: 'notification_user', value: ['agent_email'] }]
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ automation: mockAutomation })
        });

        const result = await client.get_automation(888);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-subdomain.zendesk.com/api/v2/automations/888.json',
          expect.any(Object)
        );
        expect(result).toMatchObject({
          id: mockAutomation.id,
          title: mockAutomation.title,
          active: mockAutomation.active,
          created_at: mockAutomation.created_at,
          updated_at: mockAutomation.updated_at
        });
      });
    });
  });

  // Note: Help Center methods (list_articles, get_article, list_sections, list_categories) 
  // are not implemented in the current ZendeskClientWrapper

  describe('Edge Cases and Input Validation', () => {
    describe('Empty Results', () => {
      it('should handle empty ticket list gracefully', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tickets: [] })
        });

        const result = await client.list_tickets();
        expect(result).toEqual([]);
      });

      it('should handle null/undefined fields in API response', async () => {
        const ticketWithNulls = {
          id: 123,
          subject: 'Test',
          description: null,
          status: 'open',
          priority: undefined,
          created_at: '2024-01-01',
          updated_at: null
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ticket: ticketWithNulls })
        });

        const result = await client.get_ticket(123);
        expect(result.priority).toBe('normal'); // Should default to 'normal'
        expect(result.description).toBeDefined(); // Should handle null gracefully
      });
    });

    describe('Search with Special Characters', () => {
      it('should properly encode special characters in search queries', async () => {
        const specialQuery = 'test & query "with quotes" <brackets>';
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [], count: 0 })
        });

        await client.search(specialQuery);

        const expectedUrl = `https://test-subdomain.zendesk.com/api/v2/search.json?query=${encodeURIComponent(specialQuery)}`;
        expect(global.fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
      });
    });

    describe('Bulk Operations Edge Cases', () => {
      it('should handle empty array in bulk create', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ job_status: { id: 'job123', status: 'completed' } })
        });

        const result = await client.create_many_tickets([]);
        
        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.tickets).toEqual([]);
        expect(result.job_status).toBeDefined();
      });

      it('should handle very large ticket IDs', async () => {
        const largeId = 999999999999;
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ticket: { id: largeId, subject: 'Test' } })
        });

        const result = await client.get_ticket(largeId);
        expect(result.id).toBe(largeId);
      });
    });
  });
});