import { createClient, ZendeskClient } from 'node-zendesk';

export interface Env {
  ZENDESK_SUBDOMAIN: string;
  ZENDESK_EMAIL: string;
  ZENDESK_API_KEY: string;
}

export class ZendeskClientWrapper {
  private client: ZendeskClient;
  private kbCache: { data: any; timestamp: number } | null = null;
  private readonly CACHE_TTL = 3600 * 1000;

  constructor(env: Env) {
    this.client = createClient({
      username: env.ZENDESK_EMAIL,
      token: env.ZENDESK_API_KEY,
      subdomain: env.ZENDESK_SUBDOMAIN,
    });
  }

  async get_ticket(id: number) {
    const { result } = await this.client.tickets.show(id);
    return {
      id: result.id,
      subject: result.subject,
      description: result.description,
      status: result.status,
      priority: result.priority,
      created_at: result.created_at,
      updated_at: result.updated_at,
      requester_id: result.requester_id,
      assignee_id: result.assignee_id,
      organization_id: result.organization_id,
    };
  }

  async get_ticket_comments(id: number) {
    const comments = await this.client.tickets.getComments(id);
    return comments.map((c: any) => ({
      id: c.id,
      author_id: c.author_id,
      body: c.body,
      html_body: c.html_body,
      public: c.public,
      created_at: c.created_at,
    }));
  }

  async create_ticket_comment(id: number, comment: string, isPublic = true) {
    const { result } = await this.client.tickets.update(id, {
      ticket: { comment: { body: comment, public: isPublic } },
    });
    return result;
  }

  async getKnowledgeBase() {
    if (this.kbCache && Date.now() - this.kbCache.timestamp < this.CACHE_TTL) {
      return this.kbCache.data;
    }

    const sections = await this.client.helpcenter.sections.list();
    const kb: Record<string, any> = {};
    for (const section of sections) {
      const articles = await this.client.helpcenter.articles.listBySection(section.id);
      kb[section.name] = {
        section_id: section.id,
        description: section.description,
        articles: articles.map((a: any) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          updated_at: a.updated_at,
          url: a.html_url,
        })),
      };
    }
    this.kbCache = { data: kb, timestamp: Date.now() };
    return kb;
  }
}

