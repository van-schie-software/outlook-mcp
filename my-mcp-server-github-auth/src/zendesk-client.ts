import zendesk from 'node-zendesk';

interface ZendeskEnv {
  ZENDESK_SUBDOMAIN: string;
  ZENDESK_EMAIL: string;
  ZENDESK_API_KEY: string;
}

export interface ZendeskTicket {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface ZendeskComment {
  id: number;
  body: string;
  public: boolean;
  created_at: string;
}

export interface ZendeskArticle {
  id: number;
  title: string;
  body: string;
  position?: number;
}

export interface ZendeskSection {
  id: number;
  name: string;
  position?: number;
  articles: ZendeskArticle[];
}

export class ZendeskClientWrapper {
  private client: any;
  private knowledgeBaseCache: ZendeskSection[] | null = null;

  constructor(env: ZendeskEnv) {
    // Validate required environment variables
    if (!env.ZENDESK_SUBDOMAIN || !env.ZENDESK_EMAIL || !env.ZENDESK_API_KEY) {
      throw new Error('Missing required Zendesk configuration');
    }

    this.client = zendesk.createClient({
      username: env.ZENDESK_EMAIL,
      token: env.ZENDESK_API_KEY,
      remoteUri: `https://${env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`,
    });
  }

  async get_ticket(ticketId: number): Promise<ZendeskTicket> {
    const response = await this.client.tickets.show(ticketId);
    const ticket = response.result;
    
    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    };
  }

  async get_ticket_comments(ticketId: number): Promise<ZendeskComment[]> {
    const response = await this.client.tickets.getComments(ticketId);
    const comments = response.result;
    
    return comments.map((comment: any) => ({
      id: comment.id,
      body: comment.body,
      public: comment.public,
      created_at: comment.created_at,
    }));
  }

  async create_ticket_comment(ticketId: number, body: string, isPublic: boolean = false): Promise<void> {
    await this.client.tickets.update(ticketId, {
      ticket: {
        comment: {
          body: body,
          public: isPublic,
        },
      },
    });
  }

  async getKnowledgeBase(): Promise<ZendeskSection[]> {
    // Return cached data if available
    if (this.knowledgeBaseCache) {
      return this.knowledgeBaseCache;
    }

    // Fetch sections
    const sections = await this.client.helpcenter.sections.list();
    
    // Fetch articles for each section
    const sectionsWithArticles = await Promise.all(
      sections.map(async (section: any) => {
        const articles = await this.client.helpcenter.articles.listBySection(section.id);
        
        return {
          id: section.id,
          name: section.name,
          position: section.position,
          articles: articles.map((article: any) => ({
            id: article.id,
            title: article.title,
            body: article.body,
            position: article.position,
          })),
        };
      })
    );

    // Cache the result
    this.knowledgeBaseCache = sectionsWithArticles;
    
    return sectionsWithArticles;
  }
}