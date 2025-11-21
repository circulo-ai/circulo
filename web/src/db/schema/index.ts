// ==================== SCHEMA EXPORTS ====================
// Order matters for dependencies

// Types (no dependencies)
export * from "./types";

// Auth (base entities)
export * from "./auth";

// Agent (depends on auth)
export * from "./agent";

// Knowledge (depends on auth)
export * from "./knowledge";

// Chat (depends on auth, agent, knowledge)
export * from "./chat";

// Tools (depends on auth, chat, agent)
export * from "./tools";

// Environment (depends on auth, chat)
export * from "./environment";

// Billing (depends on auth)
export * from "./billing";

// Audit (standalone)
export * from "./audit";

// Relations (depends on all above)
export * from "./relations";
