import { db, type DbInstance } from "../index";
import { createAgentRepository } from "./agent-repo";
import { createArtifactRepository } from "./artifact-repo";
import { createChatAgentRepository } from "./chat-agent-repo";
import { createChatInvitationRepository } from "./chat-invitation-repo";
import { createChatMemberRepository } from "./chat-member-repo";
import { createChatRepository } from "./chat-repo";
import { createMessageRepository } from "./message-repo";
import { createStreamRepository } from "./stream-repo";
import { createSuggestionRepository } from "./suggestion-repo";
import { createUserRepository } from "./user-repo";
import { createVoteRepository } from "./vote-repo";

export type DatabaseRepositories = Readonly<
  ReturnType<typeof createRepositories>
>;

/** Build all query repositories against one database client. */
export function createRepositories(database: DbInstance) {
  return {
    agent: createAgentRepository(database),
    artifact: createArtifactRepository(database),
    chat: createChatRepository(database),
    chatAgent: createChatAgentRepository(database),
    chatInvitation: createChatInvitationRepository(database),
    chatMember: createChatMemberRepository(database),
    message: createMessageRepository(database),
    stream: createStreamRepository(database),
    suggestion: createSuggestionRepository(database),
    user: createUserRepository(database),
    vote: createVoteRepository(database),
  };
}

/** The process-wide default bundle for callers that do not own a DB client. */
export const repositories = createRepositories(db);

// Backwards-compatible names, all sourced from the one bundle above.
export const agentRepo = repositories.agent;
export const artifactRepo = repositories.artifact;
export const chatRepo = repositories.chat;
export const chatAgentRepo = repositories.chatAgent;
export const chatInvitationRepo = repositories.chatInvitation;
export const chatMemberRepo = repositories.chatMember;
export const messageRepo = repositories.message;
export const streamRepo = repositories.stream;
export const suggestionRepo = repositories.suggestion;
export const userRepo = repositories.user;
export const voteRepo = repositories.vote;

export type { DatabaseRepositories as Repositories };

// Export types
export type { AgentFilters } from "./agent-repo";
export type { ArtifactFilters as DocumentFilters } from "./artifact-repo";
export type { ChatFilters, ConversationSummary } from "./chat-repo";
export type { MessageAuthorType, MessageFilters } from "./message-repo";
