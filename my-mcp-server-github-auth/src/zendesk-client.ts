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
  private baseUrl: string;
  public authHeader: string; // Made public for testing
  private knowledgeBaseCache: ZendeskSection[] | null = null;

  constructor(env: ZendeskEnv) {
    // Validate required environment variables
    if (!env.ZENDESK_SUBDOMAIN || !env.ZENDESK_EMAIL || !env.ZENDESK_API_KEY) {
      throw new Error('Missing required Zendesk configuration');
    }

    this.baseUrl = `https://${env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
    // Create base64 encoded auth string for Basic Auth
    // For API token auth, format is: email/token:api_token
    const authString = `${env.ZENDESK_EMAIL}/token:${env.ZENDESK_API_KEY}`;
    this.authHeader = `Basic ${btoa(authString)}`;
    
    // Debug logging
    console.log('Zendesk client initialized with subdomain:', env.ZENDESK_SUBDOMAIN);
    console.log('Using email:', env.ZENDESK_EMAIL);
    console.log('Auth string (before encoding):', authString);
    console.log('API key length:', env.ZENDESK_API_KEY.length);
    console.log('Base64 encoded auth header:', this.authHeader);
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log('Making request to:', url);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Zendesk API error:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        error: errorText
      });
      throw new Error(`Zendesk API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async get_ticket(ticketId: number): Promise<ZendeskTicket> {
    const data = await this.makeRequest(`/tickets/${ticketId}.json`);
    const ticket = data.ticket;
    
    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority || 'normal',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    };
  }

  async get_ticket_comments(ticketId: number): Promise<ZendeskComment[]> {
    const data = await this.makeRequest(`/tickets/${ticketId}/comments.json`);
    const comments = data.comments || [];
    
    return comments.map((comment: any) => ({
      id: comment.id,
      body: comment.body,
      public: comment.public,
      created_at: comment.created_at,
    }));
  }

  async create_ticket_comment(ticketId: number, body: string, isPublic: boolean = false): Promise<void> {
    await this.makeRequest(`/tickets/${ticketId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        ticket: {
          comment: {
            body: body,
            public: isPublic,
          },
        },
      }),
    });
  }

  async getKnowledgeBase(): Promise<ZendeskSection[]> {
    // Return cached data if available
    if (this.knowledgeBaseCache) {
      return this.knowledgeBaseCache;
    }

    try {
      // Fetch sections from help center
      const sectionsData = await this.makeRequest('/help_center/sections.json');
      const sections = sectionsData.sections || [];
      
      // Fetch articles for each section
      const sectionsWithArticles = await Promise.all(
        sections.map(async (section: any) => {
          try {
            const articlesData = await this.makeRequest(`/help_center/sections/${section.id}/articles.json`);
            const articles = articlesData.articles || [];
            
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
          } catch (error) {
            console.error(`Failed to fetch articles for section ${section.id}:`, error);
            return {
              id: section.id,
              name: section.name,
              position: section.position,
              articles: [],
            };
          }
        })
      );

      // Cache the result
      this.knowledgeBaseCache = sectionsWithArticles;
      
      return sectionsWithArticles;
    } catch (error) {
      console.error('Failed to fetch knowledge base:', error);
      return [];
    }
  }
}