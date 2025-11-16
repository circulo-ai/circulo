export type Metric =
  | "api_calls"
  | "chats_created"
  | "agents_created"
  | "kb_created";
export type Action =
  | "create_agent"
  | "create_chat"
  | "create_kb"
  | "add_chat_agent"
  | "create_mcp_server"
  | "create_tool";
