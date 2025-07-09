import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import { ZendeskClientWrapper } from "./zendesk-client";
import { DurableObjectState } from "@cloudflare/workers-types";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
	login: string;
	name: string;
	email: string;
	accessToken: string;
};

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to the image generation tool
	// For example: 'yourusername', 'coworkerusername'
]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "zendesk-mcp-server",
		version: "1.0.0",
	});
	private zendeskClient: ZendeskClientWrapper | null = null;

	constructor(state: DurableObjectState, env: Env, props?: Props) {
		// @ts-ignore - McpAgent might accept 2 or 3 parameters depending on version
		super(state, env, props);
	}

	private getZendeskClient(): ZendeskClientWrapper {
		if (!this.zendeskClient) {
			this.zendeskClient = new ZendeskClientWrapper(this.env);
		}
		return this.zendeskClient;
	}

	async init() {
		console.log("MyMCP init() called");
		
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		// Use the upstream access token to facilitate tools
		this.server.tool(
			"userInfoOctokit",
			"Get user info from GitHub, via Octokit",
			{},
			async () => {
				const octokit = new Octokit({ auth: this.props.accessToken });
				return {
					content: [
						{
							text: JSON.stringify(await octokit.rest.users.getAuthenticated()),
							type: "text",
						},
					],
				};
			},
		);

		// Dynamically add tools based on the user's login. In this case, I want to limit
		// access to my Image Generation tool to just me
		if (ALLOWED_USERNAMES.has(this.props.login)) {
			this.server.tool(
				"generateImage",
				"Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
				{
					prompt: z
						.string()
						.describe("A text description of the image you want to generate."),
					steps: z
						.number()
						.min(4)
						.max(8)
						.default(4)
						.describe(
							"The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.",
						),
				},
				async ({ prompt, steps }) => {
					const response = await this.env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
						prompt,
						steps,
					});

					return {
						content: [{ data: response.image!, mimeType: "image/jpeg", type: "image" }],
					};
				},
			);
		}

		// Zendesk tools
		this.server.tool(
			"zendesk_test_auth",
			"Test Zendesk authentication by getting current user",
			{},
			async () => {
				try {
					const client = this.getZendeskClient();
					// Test with users/me endpoint which should work with any valid auth
					const response = await fetch(`https://${this.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/users/me.json`, {
						headers: {
							'Authorization': client.authHeader,
							'Content-Type': 'application/json',
							'Accept': 'application/json',
						},
					});
					
					if (!response.ok) {
						const errorText = await response.text();
						return {
							content: [{
								type: "text",
								text: `Auth test failed (${response.status}): ${errorText}`
							}]
						};
					}
					
					const data = await response.json() as any;
					return {
						content: [{
							type: "text",
							text: `Auth test successful! User: ${data.user?.name} (${data.user?.email})`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Auth test error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		this.server.tool(
			"zendesk_get_ticket",
			"Get details of a specific Zendesk ticket",
			{ id: z.number().describe("The ticket ID") },
			async ({ id }) => {
				if (!id) {
					throw new Error("Ticket ID is required");
				}
				const ticket = await this.getZendeskClient().get_ticket(id);
				return {
					content: [{
						type: "text",
						text: `Ticket #${ticket.id}: ${ticket.subject}\n\nDescription: ${ticket.description}\n\nStatus: ${ticket.status}\nPriority: ${ticket.priority}\nCreated: ${ticket.created_at}\nUpdated: ${ticket.updated_at}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_ticket_comments",
			"Get all comments for a specific Zendesk ticket",
			{ ticket_id: z.number().describe("The ticket ID") },
			async ({ ticket_id }) => {
				const comments = await this.getZendeskClient().get_ticket_comments(ticket_id);
				const formattedComments = comments.map(comment => 
					`Comment #${comment.id}:\nPublic: ${comment.public ? 'Yes' : 'No'}\nCreated: ${comment.created_at}\n\n${comment.body}`
				).join('\n\n---\n\n');
				return {
					content: [{
						type: "text",
						text: formattedComments || "No comments found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_create_ticket_comment",
			"Add a comment to a Zendesk ticket",
			{ 
				ticket_id: z.number().describe("The ticket ID"),
				body: z.string().describe("The comment body"),
				public: z.boolean().default(false).describe("Whether the comment should be public")
			},
			async ({ ticket_id, body, public: isPublic }) => {
				await this.getZendeskClient().create_ticket_comment(ticket_id, body, isPublic);
				return {
					content: [{
						type: "text",
						text: "Comment added successfully"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_search_knowledge_base",
			"Search the Zendesk knowledge base for articles",
			{ query: z.string().describe("Search query") },
			async ({ query }) => {
				const knowledgeBase = await this.getZendeskClient().getKnowledgeBase();
				const searchLower = query.toLowerCase();
				
				const matchingArticles = [];
				for (const section of knowledgeBase) {
					for (const article of section.articles) {
						if (article.title.toLowerCase().includes(searchLower) || 
							article.body.toLowerCase().includes(searchLower)) {
							matchingArticles.push({
								section: section.name,
								title: article.title,
								body: article.body
							});
						}
					}
				}
				
				if (matchingArticles.length === 0) {
					return {
						content: [{
							type: "text",
							text: "No articles found matching your search query"
						}]
					};
				}
				
				const formattedArticles = matchingArticles.map(article => 
					`Section: ${article.section}\nTitle: ${article.title}\n\n${article.body}`
				).join('\n\n---\n\n');
				
				return {
					content: [{
						type: "text",
						text: formattedArticles
					}]
				};
			}
		);

		// --- Extended Ticket Tools ---
		this.server.tool(
			"zendesk_list_tickets",
			"List all tickets with optional filters",
			{ 
				status: z.string().optional().describe("Filter by status (new, open, pending, hold, solved, closed)"),
				assignee_id: z.number().optional().describe("Filter by assignee user ID"),
				requester_id: z.number().optional().describe("Filter by requester user ID")
			},
			async (params) => {
				const tickets = await this.getZendeskClient().list_tickets(params);
				const formattedTickets = tickets.map(ticket => 
					`Ticket #${ticket.id}: ${ticket.subject}\nStatus: ${ticket.status} | Priority: ${ticket.priority}\nCreated: ${ticket.created_at}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedTickets || "No tickets found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_create_ticket",
			"Create a new Zendesk ticket",
			{ 
				subject: z.string().describe("The ticket subject"),
				description: z.string().optional().describe("The ticket description or initial comment"),
				comment: z.string().optional().describe("Initial comment (overrides description if both provided)"),
				priority: z.string().optional().describe("Priority level (low, normal, high, urgent)"),
				requester_id: z.number().optional().describe("The ID of the requester"),
				assignee_id: z.number().optional().describe("The ID of the assignee"),
				group_id: z.number().optional().describe("The ID of the group"),
				tags: z.array(z.string()).optional().describe("Tags to add to the ticket"),
				custom_fields: z.array(z.any()).optional().describe("Custom field values")
			},
			async (ticketData) => {
				const ticket = await this.getZendeskClient().create_ticket(ticketData);
				return {
					content: [{
						type: "text",
						text: `Ticket created successfully!\nID: ${ticket.id}\nSubject: ${ticket.subject}\nStatus: ${ticket.status}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_update_ticket",
			"Update an existing Zendesk ticket",
			{ 
				id: z.number().describe("The ticket ID"),
				status: z.string().optional().describe("New status (new, open, pending, hold, solved, closed)"),
				priority: z.string().optional().describe("New priority (low, normal, high, urgent)"),
				subject: z.string().optional().describe("New subject")
			},
			async ({ id, ...updates }) => {
				const ticket = await this.getZendeskClient().update_ticket(id, updates);
				return {
					content: [{
						type: "text",
						text: `Ticket #${ticket.id} updated successfully!\nSubject: ${ticket.subject}\nStatus: ${ticket.status}\nPriority: ${ticket.priority}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_delete_ticket",
			"Delete a Zendesk ticket",
			{ id: z.number().describe("The ticket ID") },
			async ({ id }) => {
				await this.getZendeskClient().delete_ticket(id);
				return {
					content: [{
						type: "text",
						text: `Ticket #${id} deleted successfully`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_list_user_tickets",
			"List all tickets requested by a specific user",
			{ user_id: z.number().describe("The user ID") },
			async ({ user_id }) => {
				const tickets = await this.getZendeskClient().list_user_tickets(user_id);
				const formattedTickets = tickets.map(ticket => 
					`Ticket #${ticket.id}: ${ticket.subject}\nStatus: ${ticket.status} | Priority: ${ticket.priority}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedTickets || "No tickets found for this user"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_list_organization_tickets",
			"List all tickets for a specific organization",
			{ organization_id: z.number().describe("The organization ID") },
			async ({ organization_id }) => {
				const tickets = await this.getZendeskClient().list_organization_tickets(organization_id);
				const formattedTickets = tickets.map(ticket => 
					`Ticket #${ticket.id}: ${ticket.subject}\nStatus: ${ticket.status} | Priority: ${ticket.priority}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedTickets || "No tickets found for this organization"
					}]
				};
			}
		);

		// --- User Tools ---
		this.server.tool(
			"zendesk_list_users",
			"List all Zendesk users",
			{},
			async () => {
				const users = await this.getZendeskClient().list_users();
				const formattedUsers = users.map(user => 
					`User #${user.id}: ${user.name} (${user.email})\nRole: ${user.role} | Verified: ${user.verified ? 'Yes' : 'No'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedUsers || "No users found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_user",
			"Get details of a specific Zendesk user",
			{ id: z.number().describe("The user ID") },
			async ({ id }) => {
				const user = await this.getZendeskClient().get_user(id);
				return {
					content: [{
						type: "text",
						text: `User #${user.id}: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}\nVerified: ${user.verified ? 'Yes' : 'No'}\nOrganization ID: ${user.organization_id || 'None'}\nCreated: ${user.created_at}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_current_user",
			"Get details of the authenticated user",
			{},
			async () => {
				const user = await this.getZendeskClient().get_current_user();
				return {
					content: [{
						type: "text",
						text: `Current User: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}\nVerified: ${user.verified ? 'Yes' : 'No'}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_create_user",
			"Create a new Zendesk user",
			{ 
				name: z.string().describe("The user's name"),
				email: z.string().describe("The user's email address"),
				role: z.string().optional().describe("The user's role (end-user, agent, admin)")
			},
			async (userData) => {
				const user = await this.getZendeskClient().create_user(userData);
				return {
					content: [{
						type: "text",
						text: `User created successfully!\nID: ${user.id}\nName: ${user.name}\nEmail: ${user.email}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_update_user",
			"Update an existing Zendesk user",
			{ 
				id: z.number().describe("The user ID"),
				name: z.string().optional().describe("New name"),
				email: z.string().optional().describe("New email address"),
				role: z.string().optional().describe("New role (end-user, agent, admin)")
			},
			async ({ id, ...updates }) => {
				const user = await this.getZendeskClient().update_user(id, updates);
				return {
					content: [{
						type: "text",
						text: `User #${user.id} updated successfully!\nName: ${user.name}\nEmail: ${user.email}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_delete_user",
			"Delete a Zendesk user",
			{ id: z.number().describe("The user ID") },
			async ({ id }) => {
				await this.getZendeskClient().delete_user(id);
				return {
					content: [{
						type: "text",
						text: `User #${id} deleted successfully`
					}]
				};
			}
		);

		// --- Organization Tools ---
		this.server.tool(
			"zendesk_list_organizations",
			"List all Zendesk organizations",
			{},
			async () => {
				const organizations = await this.getZendeskClient().list_organizations();
				const formattedOrgs = organizations.map(org => 
					`Organization #${org.id}: ${org.name}\nDomains: ${org.domain_names.join(', ') || 'None'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedOrgs || "No organizations found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_organization",
			"Get details of a specific Zendesk organization",
			{ id: z.number().describe("The organization ID") },
			async ({ id }) => {
				const org = await this.getZendeskClient().get_organization(id);
				return {
					content: [{
						type: "text",
						text: `Organization #${org.id}: ${org.name}\nDomains: ${org.domain_names.join(', ') || 'None'}\nCreated: ${org.created_at}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_create_organization",
			"Create a new Zendesk organization",
			{ 
				name: z.string().describe("The organization name"),
				domain_names: z.array(z.string()).optional().describe("List of domain names")
			},
			async (orgData) => {
				const org = await this.getZendeskClient().create_organization(orgData);
				return {
					content: [{
						type: "text",
						text: `Organization created successfully!\nID: ${org.id}\nName: ${org.name}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_update_organization",
			"Update an existing Zendesk organization",
			{ 
				id: z.number().describe("The organization ID"),
				name: z.string().optional().describe("New name"),
				domain_names: z.array(z.string()).optional().describe("New list of domain names")
			},
			async ({ id, ...updates }) => {
				const org = await this.getZendeskClient().update_organization(id, updates);
				return {
					content: [{
						type: "text",
						text: `Organization #${org.id} updated successfully!\nName: ${org.name}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_delete_organization",
			"Delete a Zendesk organization",
			{ id: z.number().describe("The organization ID") },
			async ({ id }) => {
				await this.getZendeskClient().delete_organization(id);
				return {
					content: [{
						type: "text",
						text: `Organization #${id} deleted successfully`
					}]
				};
			}
		);

		// --- Search Tools ---
		this.server.tool(
			"zendesk_search",
			"Search across all Zendesk resources",
			{ query: z.string().describe("The search query using Zendesk search syntax") },
			async ({ query }) => {
				const results = await this.getZendeskClient().search(query);
				return {
					content: [{
						type: "text",
						text: `Found ${results.count} results:\n\n${JSON.stringify(results.results.slice(0, 10), null, 2)}\n\n${results.count > 10 ? `... and ${results.count - 10} more results` : ''}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_search_tickets",
			"Search for tickets using Zendesk search syntax",
			{ query: z.string().describe("The search query") },
			async ({ query }) => {
				const tickets = await this.getZendeskClient().search_tickets(query);
				const formattedTickets = tickets.map(ticket => 
					`Ticket #${ticket.id}: ${ticket.subject}\nStatus: ${ticket.status} | Priority: ${ticket.priority}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedTickets || "No tickets found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_search_users",
			"Search for users using Zendesk search syntax",
			{ query: z.string().describe("The search query") },
			async ({ query }) => {
				const users = await this.getZendeskClient().search_users(query);
				const formattedUsers = users.map(user => 
					`User #${user.id}: ${user.name} (${user.email})\nRole: ${user.role}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedUsers || "No users found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_search_organizations",
			"Search for organizations using Zendesk search syntax",
			{ query: z.string().describe("The search query") },
			async ({ query }) => {
				const orgs = await this.getZendeskClient().search_organizations(query);
				const formattedOrgs = orgs.map(org => 
					`Organization #${org.id}: ${org.name}\nDomains: ${org.domain_names.join(', ') || 'None'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedOrgs || "No organizations found"
					}]
				};
			}
		);

		// --- Group Tools ---
		this.server.tool(
			"zendesk_list_groups",
			"List all Zendesk groups",
			{},
			async () => {
				const groups = await this.getZendeskClient().list_groups();
				const formattedGroups = groups.map(group => 
					`Group #${group.id}: ${group.name}\nDescription: ${group.description || 'None'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedGroups || "No groups found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_group",
			"Get details of a specific Zendesk group",
			{ id: z.number().describe("The group ID") },
			async ({ id }) => {
				const group = await this.getZendeskClient().get_group(id);
				return {
					content: [{
						type: "text",
						text: `Group #${group.id}: ${group.name}\nDescription: ${group.description || 'None'}\nCreated: ${group.created_at}`
					}]
				};
			}
		);

		// --- Macro Tools ---
		this.server.tool(
			"zendesk_list_macros",
			"List all Zendesk macros",
			{},
			async () => {
				const macros = await this.getZendeskClient().list_macros();
				const formattedMacros = macros.map(macro => 
					`Macro #${macro.id}: ${macro.title}\nActive: ${macro.active ? 'Yes' : 'No'}\nDescription: ${macro.description || 'None'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedMacros || "No macros found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_macro",
			"Get details of a specific Zendesk macro",
			{ id: z.number().describe("The macro ID") },
			async ({ id }) => {
				const macro = await this.getZendeskClient().get_macro(id);
				return {
					content: [{
						type: "text",
						text: `Macro #${macro.id}: ${macro.title}\nActive: ${macro.active ? 'Yes' : 'No'}\nDescription: ${macro.description || 'None'}\nCreated: ${macro.created_at}`
					}]
				};
			}
		);

		// --- View Tools ---
		this.server.tool(
			"zendesk_list_views",
			"List all Zendesk views",
			{},
			async () => {
				const views = await this.getZendeskClient().list_views();
				const formattedViews = views.map(view => 
					`View #${view.id}: ${view.title}\nActive: ${view.active ? 'Yes' : 'No'}\nDescription: ${view.description || 'None'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedViews || "No views found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_view",
			"Get details of a specific Zendesk view",
			{ id: z.number().describe("The view ID") },
			async ({ id }) => {
				const view = await this.getZendeskClient().get_view(id);
				return {
					content: [{
						type: "text",
						text: `View #${view.id}: ${view.title}\nActive: ${view.active ? 'Yes' : 'No'}\nDescription: ${view.description || 'None'}\nCreated: ${view.created_at}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_execute_view",
			"Execute a view and get the resulting tickets",
			{ id: z.number().describe("The view ID") },
			async ({ id }) => {
				const tickets = await this.getZendeskClient().execute_view(id);
				const formattedTickets = tickets.map(ticket => 
					`Ticket #${ticket.id}: ${ticket.subject}\nStatus: ${ticket.status} | Priority: ${ticket.priority}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedTickets || "No tickets found in this view"
					}]
				};
			}
		);

		// --- Trigger Tools ---
		this.server.tool(
			"zendesk_list_triggers",
			"List all Zendesk triggers",
			{},
			async () => {
				const triggers = await this.getZendeskClient().list_triggers();
				const formattedTriggers = triggers.map(trigger => 
					`Trigger #${trigger.id}: ${trigger.title}\nActive: ${trigger.active ? 'Yes' : 'No'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedTriggers || "No triggers found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_trigger",
			"Get details of a specific Zendesk trigger",
			{ id: z.number().describe("The trigger ID") },
			async ({ id }) => {
				const trigger = await this.getZendeskClient().get_trigger(id);
				return {
					content: [{
						type: "text",
						text: `Trigger #${trigger.id}: ${trigger.title}\nActive: ${trigger.active ? 'Yes' : 'No'}\nCreated: ${trigger.created_at}`
					}]
				};
			}
		);

		// --- Automation Tools ---
		this.server.tool(
			"zendesk_list_automations",
			"List all Zendesk automations",
			{},
			async () => {
				const automations = await this.getZendeskClient().list_automations();
				const formattedAutomations = automations.map(automation => 
					`Automation #${automation.id}: ${automation.title}\nActive: ${automation.active ? 'Yes' : 'No'}`
				).join('\n\n');
				return {
					content: [{
						type: "text",
						text: formattedAutomations || "No automations found"
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_get_automation",
			"Get details of a specific Zendesk automation",
			{ id: z.number().describe("The automation ID") },
			async ({ id }) => {
				const automation = await this.getZendeskClient().get_automation(id);
				return {
					content: [{
						type: "text",
						text: `Automation #${automation.id}: ${automation.title}\nActive: ${automation.active ? 'Yes' : 'No'}\nCreated: ${automation.created_at}`
					}]
				};
			}
		);

		// --- Bulk Operation Tools ---
		this.server.tool(
			"zendesk_create_many_tickets",
			"Create multiple tickets in bulk",
			{ 
				tickets: z.array(z.object({
					subject: z.string().describe("The ticket subject"),
					description: z.string().optional().describe("The ticket description"),
					comment: z.string().optional().describe("Initial comment text"),
					priority: z.string().optional().describe("Priority (low, normal, high, urgent)"),
					requester_id: z.number().optional().describe("Requester user ID"),
					assignee_id: z.number().optional().describe("Assignee user ID"),
					group_id: z.number().optional().describe("Group ID"),
					tags: z.array(z.string()).optional().describe("Tags array"),
					custom_fields: z.array(z.any()).optional().describe("Custom fields")
				})).describe("Array of tickets to create")
			},
			async ({ tickets }) => {
				const result = await this.getZendeskClient().create_many_tickets(tickets);
				return {
					content: [{
						type: "text",
						text: `Bulk ticket creation job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_update_many_tickets",
			"Update multiple tickets in bulk",
			{ 
				ticket_ids: z.array(z.number()).describe("Array of ticket IDs to update"),
				status: z.string().optional().describe("New status"),
				priority: z.string().optional().describe("New priority"),
				assignee_id: z.number().optional().describe("New assignee ID"),
				group_id: z.number().optional().describe("New group ID"),
				tags: z.array(z.string()).optional().describe("New tags")
			},
			async ({ ticket_ids, ...updates }) => {
				const result = await this.getZendeskClient().update_many_tickets(ticket_ids, updates);
				return {
					content: [{
						type: "text",
						text: `Bulk ticket update job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_delete_many_tickets",
			"Delete multiple tickets in bulk",
			{ 
				ticket_ids: z.array(z.number()).describe("Array of ticket IDs to delete")
			},
			async ({ ticket_ids }) => {
				const result = await this.getZendeskClient().delete_many_tickets(ticket_ids);
				return {
					content: [{
						type: "text",
						text: `Bulk ticket deletion job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_merge_tickets",
			"Merge one or more tickets into a target ticket",
			{ 
				source_ticket_id: z.number().describe("The source ticket ID to merge"),
				target_ticket_id: z.number().describe("The target ticket ID to merge into"),
				target_comment: z.string().optional().describe("Optional comment for the target ticket")
			},
			async ({ source_ticket_id, target_ticket_id, target_comment }) => {
				const result = await this.getZendeskClient().merge_tickets(source_ticket_id, target_ticket_id, target_comment);
				return {
					content: [{
						type: "text",
						text: `Ticket merge job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		// --- Bulk User Operations ---
		this.server.tool(
			"zendesk_create_many_users",
			"Create multiple users in bulk",
			{ 
				users: z.array(z.object({
					name: z.string().describe("User name"),
					email: z.string().describe("User email"),
					role: z.string().optional().describe("User role (end-user, agent, admin)")
				})).describe("Array of users to create")
			},
			async ({ users }) => {
				const result = await this.getZendeskClient().create_many_users(users);
				return {
					content: [{
						type: "text",
						text: `Bulk user creation job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_create_or_update_user",
			"Create a new user or update existing one by email",
			{ 
				name: z.string().describe("User name"),
				email: z.string().describe("User email"),
				role: z.string().optional().describe("User role")
			},
			async (userData) => {
				const user = await this.getZendeskClient().create_or_update_user(userData);
				return {
					content: [{
						type: "text",
						text: `User created/updated: #${user.id} ${user.name} (${user.email})`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_update_many_users",
			"Update multiple users in bulk",
			{ 
				users: z.array(z.object({
					id: z.number().describe("User ID"),
					name: z.string().optional().describe("New name"),
					email: z.string().optional().describe("New email"),
					role: z.string().optional().describe("New role")
				})).describe("Array of users to update")
			},
			async ({ users }) => {
				const result = await this.getZendeskClient().update_many_users(users);
				return {
					content: [{
						type: "text",
						text: `Bulk user update job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_delete_many_users",
			"Delete multiple users in bulk",
			{ 
				user_ids: z.array(z.number()).describe("Array of user IDs to delete")
			},
			async ({ user_ids }) => {
				const result = await this.getZendeskClient().delete_many_users(user_ids);
				return {
					content: [{
						type: "text",
						text: `Bulk user deletion job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_suspend_user",
			"Suspend a user account",
			{ 
				user_id: z.number().describe("The user ID to suspend")
			},
			async ({ user_id }) => {
				const user = await this.getZendeskClient().suspend_user(user_id);
				return {
					content: [{
						type: "text",
						text: `User #${user.id} (${user.name}) has been suspended`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_unsuspend_user",
			"Unsuspend a user account",
			{ 
				user_id: z.number().describe("The user ID to unsuspend")
			},
			async ({ user_id }) => {
				const user = await this.getZendeskClient().unsuspend_user(user_id);
				return {
					content: [{
						type: "text",
						text: `User #${user.id} (${user.name}) has been unsuspended`
					}]
				};
			}
		);

		// --- Bulk Organization Operations ---
		this.server.tool(
			"zendesk_create_many_organizations",
			"Create multiple organizations in bulk",
			{ 
				organizations: z.array(z.object({
					name: z.string().describe("Organization name"),
					domain_names: z.array(z.string()).optional().describe("Domain names")
				})).describe("Array of organizations to create")
			},
			async ({ organizations }) => {
				const result = await this.getZendeskClient().create_many_organizations(organizations);
				return {
					content: [{
						type: "text",
						text: `Bulk organization creation job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_create_or_update_organization",
			"Create a new organization or update existing one",
			{ 
				name: z.string().describe("Organization name"),
				domain_names: z.array(z.string()).optional().describe("Domain names")
			},
			async (orgData) => {
				const org = await this.getZendeskClient().create_or_update_organization(orgData);
				return {
					content: [{
						type: "text",
						text: `Organization created/updated: #${org.id} ${org.name}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_update_many_organizations",
			"Update multiple organizations in bulk",
			{ 
				organizations: z.array(z.object({
					id: z.number().describe("Organization ID"),
					name: z.string().optional().describe("New name"),
					domain_names: z.array(z.string()).optional().describe("New domain names")
				})).describe("Array of organizations to update")
			},
			async ({ organizations }) => {
				const result = await this.getZendeskClient().update_many_organizations(organizations);
				return {
					content: [{
						type: "text",
						text: `Bulk organization update job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);

		this.server.tool(
			"zendesk_delete_many_organizations",
			"Delete multiple organizations in bulk",
			{ 
				organization_ids: z.array(z.number()).describe("Array of organization IDs to delete")
			},
			async ({ organization_ids }) => {
				const result = await this.getZendeskClient().delete_many_organizations(organization_ids);
				return {
					content: [{
						type: "text",
						text: `Bulk organization deletion job submitted. Job status: ${JSON.stringify(result.job_status)}`
					}]
				};
			}
		);
	}

	async fetch(request: Request): Promise<Response> {
		try {
			console.log(`MyMCP fetch() called: ${request.method} ${request.url}`);
			
			if (request.method === "GET" && !request.url.includes("/sse")) {
				return new Response(JSON.stringify({
					name: "zendesk-mcp-server",
					version: "1.0.0",
					description: "MCP server for Zendesk integration"
				}), {
					headers: { "Content-Type": "application/json" }
				});
			}
			
			return super.fetch(request);
		} catch (error) {
			console.error("Error in MyMCP fetch():", error);
			throw error;
		}
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.mount("/sse") as any,
	apiRoute: "/sse",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});
