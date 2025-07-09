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

export interface ZendeskUser {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  created_at: string;
  updated_at: string;
  organization_id?: number;
}

export interface ZendeskOrganization {
  id: number;
  name: string;
  domain_names: string[];
  created_at: string;
  updated_at: string;
}

export interface ZendeskGroup {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ZendeskMacro {
  id: number;
  title: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZendeskView {
  id: number;
  title: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZendeskTrigger {
  id: number;
  title: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZendeskAutomation {
  id: number;
  title: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZendeskSearchResult {
  results: any[];
  count: number;
  next_page?: string;
  previous_page?: string;
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
    // Authentication is set up with email/token:api_key format
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Making authenticated request to Zendesk API
    
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
      let errorDetails: any;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = { message: errorText };
      }

      console.error('Zendesk API error:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        error: errorDetails
      });

      // Extract meaningful error message
      const errorMessage = errorDetails.error || 
                          errorDetails.description || 
                          errorDetails.message || 
                          (errorDetails.details && JSON.stringify(errorDetails.details)) ||
                          errorText;

      throw new Error(`Zendesk API Error (${response.status}): ${errorMessage}`);
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

  // --- Extended Ticket Methods ---
  async list_tickets(params?: { status?: string; assignee_id?: number; requester_id?: number }): Promise<ZendeskTicket[]> {
    let endpoint = '/tickets.json';
    if (params) {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.append('status', params.status);
      if (params.assignee_id) queryParams.append('assignee_id', params.assignee_id.toString());
      if (params.requester_id) queryParams.append('requester_id', params.requester_id.toString());
      if (queryParams.toString()) endpoint += `?${queryParams.toString()}`;
    }
    
    const data = await this.makeRequest(endpoint);
    return (data.tickets || []).map((ticket: any) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority || 'normal',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    }));
  }

  async create_ticket(ticketData: { 
    subject: string; 
    description?: string; 
    comment?: string; 
    priority?: string; 
    requester_id?: number;
    assignee_id?: number;
    group_id?: number;
    tags?: string[];
    custom_fields?: any[];
  }): Promise<ZendeskTicket> {
    // Format the ticket payload
    const ticketPayload: any = { ...ticketData };
    
    // If comment is provided, format it properly
    if (ticketPayload.comment) {
      ticketPayload.comment = { body: ticketPayload.comment };
    }
    
    // If description is provided but no comment, create comment from description
    if (ticketPayload.description && !ticketPayload.comment) {
      ticketPayload.comment = { body: ticketPayload.description };
      delete ticketPayload.description;
    }
    
    const data = await this.makeRequest('/tickets.json', {
      method: 'POST',
      body: JSON.stringify({
        ticket: ticketPayload
      }),
    });
    
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

  async update_ticket(ticketId: number, updates: { status?: string; priority?: string; subject?: string }): Promise<ZendeskTicket> {
    const data = await this.makeRequest(`/tickets/${ticketId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        ticket: updates
      }),
    });
    
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

  async delete_ticket(ticketId: number): Promise<void> {
    await this.makeRequest(`/tickets/${ticketId}.json`, {
      method: 'DELETE',
    });
  }

  // --- Bulk Ticket Operations ---
  async create_many_tickets(tickets: Array<{
    subject: string; 
    description?: string; 
    comment?: string; 
    priority?: string; 
    requester_id?: number;
    assignee_id?: number;
    group_id?: number;
    tags?: string[];
    custom_fields?: any[];
  }>): Promise<{ job_status: any }> {
    // Format each ticket
    const formattedTickets = tickets.map(ticketData => {
      const ticketPayload: any = { ...ticketData };
      
      if (ticketPayload.comment) {
        ticketPayload.comment = { body: ticketPayload.comment };
      }
      
      if (ticketPayload.description && !ticketPayload.comment) {
        ticketPayload.comment = { body: ticketPayload.description };
        delete ticketPayload.description;
      }
      
      return ticketPayload;
    });

    const data = await this.makeRequest('/tickets/create_many.json', {
      method: 'POST',
      body: JSON.stringify({
        tickets: formattedTickets
      }),
    });
    
    return { job_status: data.job_status };
  }

  async update_many_tickets(ticketIds: number[], updates: { 
    status?: string; 
    priority?: string; 
    assignee_id?: number;
    group_id?: number;
    tags?: string[];
  }): Promise<{ job_status: any }> {
    const ids = ticketIds.join(',');
    const data = await this.makeRequest(`/tickets/update_many.json?ids=${ids}`, {
      method: 'PUT',
      body: JSON.stringify({
        ticket: updates
      }),
    });
    
    return { job_status: data.job_status };
  }

  async delete_many_tickets(ticketIds: number[]): Promise<{ job_status: any }> {
    const ids = ticketIds.join(',');
    const data = await this.makeRequest(`/tickets/destroy_many.json?ids=${ids}`, {
      method: 'DELETE',
    });
    
    return { job_status: data.job_status };
  }

  async merge_tickets(sourceTicketId: number, targetTicketId: number, targetComment?: string): Promise<{ job_status: any }> {
    const payload: any = {
      ids: [sourceTicketId],
      target_ticket_id: targetTicketId
    };
    
    if (targetComment) {
      payload.target_comment = targetComment;
    }
    
    const data = await this.makeRequest('/tickets/merge.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return { job_status: data.job_status };
  }

  async list_user_tickets(userId: number): Promise<ZendeskTicket[]> {
    const data = await this.makeRequest(`/users/${userId}/tickets/requested.json`);
    return (data.tickets || []).map((ticket: any) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority || 'normal',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    }));
  }

  async list_organization_tickets(organizationId: number): Promise<ZendeskTicket[]> {
    const data = await this.makeRequest(`/organizations/${organizationId}/tickets.json`);
    return (data.tickets || []).map((ticket: any) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority || 'normal',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    }));
  }

  // --- User Methods ---
  async list_users(): Promise<ZendeskUser[]> {
    const data = await this.makeRequest('/users.json');
    return (data.users || []).map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    }));
  }

  async get_user(userId: number): Promise<ZendeskUser> {
    const data = await this.makeRequest(`/users/${userId}.json`);
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  async get_current_user(): Promise<ZendeskUser> {
    const data = await this.makeRequest('/users/me.json');
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  async create_user(userData: { name: string; email: string; role?: string }): Promise<ZendeskUser> {
    const data = await this.makeRequest('/users.json', {
      method: 'POST',
      body: JSON.stringify({
        user: userData
      }),
    });
    
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  async update_user(userId: number, updates: { name?: string; email?: string; role?: string }): Promise<ZendeskUser> {
    const data = await this.makeRequest(`/users/${userId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        user: updates
      }),
    });
    
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  async delete_user(userId: number): Promise<void> {
    await this.makeRequest(`/users/${userId}.json`, {
      method: 'DELETE',
    });
  }

  // --- Bulk User Operations ---
  async create_many_users(users: Array<{ name: string; email: string; role?: string }>): Promise<{ job_status: any }> {
    const data = await this.makeRequest('/users/create_many.json', {
      method: 'POST',
      body: JSON.stringify({
        users: users
      }),
    });
    
    return { job_status: data.job_status };
  }

  async create_or_update_user(userData: { name: string; email: string; role?: string }): Promise<ZendeskUser> {
    const data = await this.makeRequest('/users/create_or_update.json', {
      method: 'POST',
      body: JSON.stringify({
        user: userData
      }),
    });
    
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  async update_many_users(users: Array<{ id: number; name?: string; email?: string; role?: string }>): Promise<{ job_status: any }> {
    const data = await this.makeRequest('/users/update_many.json', {
      method: 'PUT',
      body: JSON.stringify({
        users: users
      }),
    });
    
    return { job_status: data.job_status };
  }

  async delete_many_users(userIds: number[]): Promise<{ job_status: any }> {
    const ids = userIds.join(',');
    const data = await this.makeRequest(`/users/destroy_many.json?ids=${ids}`, {
      method: 'DELETE',
    });
    
    return { job_status: data.job_status };
  }

  async suspend_user(userId: number): Promise<ZendeskUser> {
    const data = await this.makeRequest(`/users/${userId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        user: { suspended: true }
      }),
    });
    
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  async unsuspend_user(userId: number): Promise<ZendeskUser> {
    const data = await this.makeRequest(`/users/${userId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        user: { suspended: false }
      }),
    });
    
    const user = data.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    };
  }

  // --- Organization Methods ---
  async list_organizations(): Promise<ZendeskOrganization[]> {
    const data = await this.makeRequest('/organizations.json');
    return (data.organizations || []).map((org: any) => ({
      id: org.id,
      name: org.name,
      domain_names: org.domain_names || [],
      created_at: org.created_at,
      updated_at: org.updated_at,
    }));
  }

  async get_organization(organizationId: number): Promise<ZendeskOrganization> {
    const data = await this.makeRequest(`/organizations/${organizationId}.json`);
    const org = data.organization;
    return {
      id: org.id,
      name: org.name,
      domain_names: org.domain_names || [],
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async create_organization(orgData: { name: string; domain_names?: string[] }): Promise<ZendeskOrganization> {
    const data = await this.makeRequest('/organizations.json', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgData
      }),
    });
    
    const org = data.organization;
    return {
      id: org.id,
      name: org.name,
      domain_names: org.domain_names || [],
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async update_organization(organizationId: number, updates: { name?: string; domain_names?: string[] }): Promise<ZendeskOrganization> {
    const data = await this.makeRequest(`/organizations/${organizationId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        organization: updates
      }),
    });
    
    const org = data.organization;
    return {
      id: org.id,
      name: org.name,
      domain_names: org.domain_names || [],
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async delete_organization(organizationId: number): Promise<void> {
    await this.makeRequest(`/organizations/${organizationId}.json`, {
      method: 'DELETE',
    });
  }

  // --- Bulk Organization Operations ---
  async create_many_organizations(organizations: Array<{ name: string; domain_names?: string[] }>): Promise<{ job_status: any }> {
    const data = await this.makeRequest('/organizations/create_many.json', {
      method: 'POST',
      body: JSON.stringify({
        organizations: organizations
      }),
    });
    
    return { job_status: data.job_status };
  }

  async create_or_update_organization(orgData: { name: string; domain_names?: string[] }): Promise<ZendeskOrganization> {
    const data = await this.makeRequest('/organizations/create_or_update.json', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgData
      }),
    });
    
    const org = data.organization;
    return {
      id: org.id,
      name: org.name,
      domain_names: org.domain_names || [],
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async update_many_organizations(organizations: Array<{ id: number; name?: string; domain_names?: string[] }>): Promise<{ job_status: any }> {
    const data = await this.makeRequest('/organizations/update_many.json', {
      method: 'PUT',
      body: JSON.stringify({
        organizations: organizations
      }),
    });
    
    return { job_status: data.job_status };
  }

  async delete_many_organizations(organizationIds: number[]): Promise<{ job_status: any }> {
    const ids = organizationIds.join(',');
    const data = await this.makeRequest(`/organizations/destroy_many.json?ids=${ids}`, {
      method: 'DELETE',
    });
    
    return { job_status: data.job_status };
  }

  // --- Search Methods ---
  async search(query: string): Promise<ZendeskSearchResult> {
    const encodedQuery = encodeURIComponent(query);
    const data = await this.makeRequest(`/search.json?query=${encodedQuery}`);
    return {
      results: data.results || [],
      count: data.count || 0,
      next_page: data.next_page,
      previous_page: data.previous_page,
    };
  }

  async search_tickets(query: string): Promise<ZendeskTicket[]> {
    const fullQuery = `type:ticket ${query}`;
    const searchResult = await this.search(fullQuery);
    return searchResult.results.map((ticket: any) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority || 'normal',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    }));
  }

  async search_users(query: string): Promise<ZendeskUser[]> {
    const fullQuery = `type:user ${query}`;
    const searchResult = await this.search(fullQuery);
    return searchResult.results.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified || false,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organization_id: user.organization_id,
    }));
  }

  async search_organizations(query: string): Promise<ZendeskOrganization[]> {
    const fullQuery = `type:organization ${query}`;
    const searchResult = await this.search(fullQuery);
    return searchResult.results.map((org: any) => ({
      id: org.id,
      name: org.name,
      domain_names: org.domain_names || [],
      created_at: org.created_at,
      updated_at: org.updated_at,
    }));
  }

  // --- Group Methods ---
  async list_groups(): Promise<ZendeskGroup[]> {
    const data = await this.makeRequest('/groups.json');
    return (data.groups || []).map((group: any) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      created_at: group.created_at,
      updated_at: group.updated_at,
    }));
  }

  async get_group(groupId: number): Promise<ZendeskGroup> {
    const data = await this.makeRequest(`/groups/${groupId}.json`);
    const group = data.group;
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      created_at: group.created_at,
      updated_at: group.updated_at,
    };
  }

  // --- Macro Methods ---
  async list_macros(): Promise<ZendeskMacro[]> {
    const data = await this.makeRequest('/macros.json');
    return (data.macros || []).map((macro: any) => ({
      id: macro.id,
      title: macro.title,
      description: macro.description,
      active: macro.active,
      created_at: macro.created_at,
      updated_at: macro.updated_at,
    }));
  }

  async get_macro(macroId: number): Promise<ZendeskMacro> {
    const data = await this.makeRequest(`/macros/${macroId}.json`);
    const macro = data.macro;
    return {
      id: macro.id,
      title: macro.title,
      description: macro.description,
      active: macro.active,
      created_at: macro.created_at,
      updated_at: macro.updated_at,
    };
  }

  // --- View Methods ---
  async list_views(): Promise<ZendeskView[]> {
    const data = await this.makeRequest('/views.json');
    return (data.views || []).map((view: any) => ({
      id: view.id,
      title: view.title,
      description: view.description,
      active: view.active,
      created_at: view.created_at,
      updated_at: view.updated_at,
    }));
  }

  async get_view(viewId: number): Promise<ZendeskView> {
    const data = await this.makeRequest(`/views/${viewId}.json`);
    const view = data.view;
    return {
      id: view.id,
      title: view.title,
      description: view.description,
      active: view.active,
      created_at: view.created_at,
      updated_at: view.updated_at,
    };
  }

  async execute_view(viewId: number): Promise<ZendeskTicket[]> {
    const data = await this.makeRequest(`/views/${viewId}/tickets.json`);
    return (data.tickets || []).map((ticket: any) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority || 'normal',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    }));
  }

  // --- Trigger Methods ---
  async list_triggers(): Promise<ZendeskTrigger[]> {
    const data = await this.makeRequest('/triggers.json');
    return (data.triggers || []).map((trigger: any) => ({
      id: trigger.id,
      title: trigger.title,
      active: trigger.active,
      created_at: trigger.created_at,
      updated_at: trigger.updated_at,
    }));
  }

  async get_trigger(triggerId: number): Promise<ZendeskTrigger> {
    const data = await this.makeRequest(`/triggers/${triggerId}.json`);
    const trigger = data.trigger;
    return {
      id: trigger.id,
      title: trigger.title,
      active: trigger.active,
      created_at: trigger.created_at,
      updated_at: trigger.updated_at,
    };
  }

  // --- Automation Methods ---
  async list_automations(): Promise<ZendeskAutomation[]> {
    const data = await this.makeRequest('/automations.json');
    return (data.automations || []).map((automation: any) => ({
      id: automation.id,
      title: automation.title,
      active: automation.active,
      created_at: automation.created_at,
      updated_at: automation.updated_at,
    }));
  }

  async get_automation(automationId: number): Promise<ZendeskAutomation> {
    const data = await this.makeRequest(`/automations/${automationId}.json`);
    const automation = data.automation;
    return {
      id: automation.id,
      title: automation.title,
      active: automation.active,
      created_at: automation.created_at,
      updated_at: automation.updated_at,
    };
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