import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import { ZendeskClientWrapper } from "./zendesk-client";

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
                name: "Github OAuth Proxy Demo",
                version: "1.0.0",
        });
        private zendeskClient = new ZendeskClientWrapper(this.env);

	async init() {
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

                // Zendesk integration tools
                this.server.tool(
                        "zendesk/get_ticket",
                        "Retrieve a Zendesk ticket by its ID",
                        { id: z.number() },
                        async ({ id }) => ({
                                content: [
                                        { text: JSON.stringify(await this.zendeskClient.get_ticket(id)), type: "text" },
                                ],
                        }),
                );

                this.server.tool(
                        "zendesk/get_ticket_comments",
                        "Retrieve all comments for a Zendesk ticket by its ID",
                        { id: z.number() },
                        async ({ id }) => ({
                                content: [
                                        { text: JSON.stringify(await this.zendeskClient.get_ticket_comments(id)), type: "text" },
                                ],
                        }),
                );

                this.server.tool(
                        "zendesk/create_ticket_comment",
                        "Create a new comment on an existing Zendesk ticket",
                        { id: z.number(), comment: z.string(), public: z.boolean().optional() },
                        async ({ id, comment, public: isPublic = true }) => ({
                                content: [
                                        { text: JSON.stringify(await this.zendeskClient.create_ticket_comment(id, comment, isPublic)), type: "text" },
                                ],
                        }),
                );

                // Zendesk prompts
                this.server.prompt(
                        "zendesk/analyze-ticket",
                        "Analyze a Zendesk ticket and provide insights",
                        { ticket_id: z.string() },
                        async ({ ticket_id }) => ({
                                messages: [
                                        {
                                                role: "user",
                                                content: {
                                                        type: "text",
                                                        text: `You are a helpful Zendesk support analyst. You've been asked to analyze ticket #${Number(ticket_id)}.\n\nPlease fetch the ticket info and comments to analyze it and provide:\n1. A summary of the issue\n2. The current status and timeline\n3. Key points of interaction\n\nRemember to be professional and focus on actionable insights.`,
                                                },
                                        },
                                ],
                        }),
                );

                this.server.prompt(
                        "zendesk/draft-ticket-response",
                        "Draft a professional response to a Zendesk ticket",
                        { ticket_id: z.string() },
                        async ({ ticket_id }) => ({
                                messages: [
                                        {
                                                role: "user",
                                                content: {
                                                        type: "text",
                                                        text: `You are a helpful Zendesk support agent. You need to draft a response to ticket #${Number(ticket_id)}.\n\nPlease fetch the ticket info, comments and knowledge base to draft a professional and helpful response that:\n1. Acknowledges the customer's concern\n2. Addresses the specific issues raised\n3. Provides clear next steps or ask for specific details need to proceed\n4. Maintains a friendly and professional tone\n5. Ask for confirmation before commenting on the ticket\n\nThe response should be formatted well and ready to be posted as a comment.`,
                                                },
                                        },
                                ],
                        }),
                );

                // Zendesk knowledge base resource
                this.server.resource(
                        "zendesk/knowledge-base",
                        "zendesk://knowledge-base",
                        async (uri) => {
                                const kb = await this.zendeskClient.getKnowledgeBase();
                                const body = JSON.stringify({
                                        knowledge_base: kb,
                                        metadata: {
                                                sections: Object.keys(kb).length,
                                                total_articles: Object.values(kb).reduce((n: number, s: any) => n + s.articles.length, 0),
                                        },
                                });
                                return {
                                        contents: [{ uri: uri.toString(), type: "text", text: body }],
                                } as any;
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
