/**
 * Curated MCP recipes for common day-one workflows. These are intentionally
 * connection templates, not fake live integrations: an administrator must
 * provide the endpoint and credential reference before a remote server can
 * execute. Built-in plugins remain executable without any setup.
 */
export type StarterMcpRecipe = {
  id: string;
  name: string;
  description: string;
  useCases: string[];
  recommendedTools: string[];
  endpoint?: string;
  credentialRef: string | null;
  transport: "sse" | "streamable_http";
  readyNow?: boolean;
  setup: string;
};

export const STARTER_MCP_CATALOG: StarterMcpRecipe[] = [
  {
    id: "starter:context7",
    name: "Context7 documentation",
    description:
      "Retrieve current library documentation and code examples for engineering work.",
    useCases: ["Software development", "API research", "Code review"],
    recommendedTools: ["resolve-library-id", "query-docs"],
    endpoint: "https://mcp.context7.com/mcp",
    credentialRef: null,
    transport: "streamable_http" as const,
    readyNow: true,
    setup:
      "Verified public endpoint. Review discovered tools and publish it only for agents that need documentation access.",
  },
  {
    id: "starter:web-research",
    name: "Web research",
    description:
      "Fetch pages, extract readable text, and support source-backed research workflows.",
    useCases: ["Research", "Fact checking", "Competitive analysis"],
    recommendedTools: ["fetch", "search"],
    credentialRef: "MCP_CREDENTIAL_WEB_RESEARCH",
    transport: "streamable_http" as const,
    setup:
      "Connect a trusted web research MCP server and keep network access scoped to approved agents.",
  },
  {
    id: "starter:documents",
    name: "Documents and files",
    description:
      "Search, read, and update files from a controlled document workspace.",
    useCases: ["Knowledge work", "Document review", "File operations"],
    recommendedTools: ["list_files", "read_file", "write_file"],
    credentialRef: "MCP_CREDENTIAL_DOCUMENTS",
    transport: "streamable_http" as const,
    setup:
      "Connect a document MCP server with a workspace folder allowlist before enabling writes.",
  },
  {
    id: "starter:project-management",
    name: "Project management",
    description:
      "Read project context, create follow-ups, and keep task status synchronized.",
    useCases: ["Planning", "Team coordination", "Follow-ups"],
    recommendedTools: ["search_tasks", "create_task", "update_task"],
    credentialRef: "MCP_CREDENTIAL_PROJECTS",
    transport: "streamable_http" as const,
    setup:
      "Connect your project system and set write tools to approval-required before first use.",
  },
  {
    id: "starter:calendar-and-email",
    name: "Calendar and email",
    description:
      "Coordinate schedules and draft communications with explicit approval for sending.",
    useCases: ["Meetings", "Scheduling", "Inbox triage"],
    recommendedTools: ["find_events", "draft_email", "create_event"],
    credentialRef: "MCP_CREDENTIAL_COMMUNICATIONS",
    transport: "streamable_http" as const,
    setup:
      "Connect a communications MCP server; keep sending and event creation behind human approval.",
  },
  {
    id: "starter:analytics",
    name: "Analytics and data",
    description:
      "Inspect approved datasets and produce repeatable analysis without broad database access.",
    useCases: ["Reporting", "Metrics", "Data exploration"],
    recommendedTools: ["query", "describe_table", "export"],
    credentialRef: "MCP_CREDENTIAL_ANALYTICS",
    transport: "streamable_http" as const,
    setup:
      "Connect a read-only analytics MCP server and restrict it to approved datasets.",
  },
] as const;
