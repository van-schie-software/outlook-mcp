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

	constructor(state: DurableObjectState, env: Env, props: Props) {
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
