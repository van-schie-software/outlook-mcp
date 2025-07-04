import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZendeskClientWrapper } from './zendesk-client';
type Env = {
  OAUTH_KV: any;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  MCP_OBJECT: any;
  AI: any;
  ZENDESK_SUBDOMAIN: string;
  ZENDESK_EMAIL: string;
  ZENDESK_API_KEY: string;
};

const mockShow = vi.fn();
const mockGetComments = vi.fn();
const mockUpdate = vi.fn();
const mockSectionsList = vi.fn();
const mockArticlesListBySection = vi.fn();

vi.mock('node-zendesk', () => ({
  createClient: vi.fn(() => ({
    tickets: { show: mockShow, getComments: mockGetComments, update: mockUpdate },
    helpcenter: {
      sections: { list: mockSectionsList },
      articles: { listBySection: mockArticlesListBySection },
    },
  })),
}));

const env: Env = {
  OAUTH_KV: {} as any,
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  MCP_OBJECT: {} as any,
  AI: {} as any,
  ZENDESK_SUBDOMAIN: 'test',
  ZENDESK_EMAIL: 'user@example.com',
  ZENDESK_API_KEY: 'key',
};

beforeEach(() => {
  mockShow.mockResolvedValue({ result: { id: 1 } });
  mockGetComments.mockResolvedValue([]);
  mockUpdate.mockResolvedValue({ result: 'ok' });
  mockSectionsList.mockResolvedValue([]);
  mockArticlesListBySection.mockResolvedValue([]);
});

describe('ZendeskClientWrapper', () => {
  it('calls show when getting a ticket', async () => {
    const client = new ZendeskClientWrapper(env);
    await client.get_ticket(5);
    expect(mockShow).toHaveBeenCalledWith(5);
  });

  it('calls getComments when fetching comments', async () => {
    const client = new ZendeskClientWrapper(env);
    await client.get_ticket_comments(7);
    expect(mockGetComments).toHaveBeenCalledWith(7);
  });

  it('calls update when creating comment', async () => {
    const client = new ZendeskClientWrapper(env);
    await client.create_ticket_comment(3, 'hi');
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('caches knowledge base', async () => {
    const client = new ZendeskClientWrapper(env);
    mockSectionsList.mockResolvedValue([{ id: 1, name: 'sec', description: '' }]);
    mockArticlesListBySection.mockResolvedValue([{ id: 2, title: 'a', body: '', updated_at: '', html_url: '' }]);
    await client.getKnowledgeBase();
    await client.getKnowledgeBase();
    expect(mockSectionsList).toHaveBeenCalledTimes(1);
  });
});

