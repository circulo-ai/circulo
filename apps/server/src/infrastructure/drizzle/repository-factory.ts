import type { DbInstance } from "@circulo-ai/db";
import { DrizzleAgentRepository } from "./agent-repository";
import { DrizzleArtifactRepository } from "./artifact-repository";
import { DrizzleChatAgentLinkRepository } from "./chat-agent-link-repository";
import { DrizzleChatInvitationRepository } from "./chat-invitation-repository";
import { DrizzleChatMemberRepository } from "./chat-member-repository";
import { DrizzleChatRepository } from "./chat-repository";
import { DrizzleMessageRepository } from "./message-repository";
import { DrizzleOrganizationMemberRepository } from "./organization-member-repository";
import { DrizzleOrganizationRepository } from "./organization-repository";
import { DrizzleSuggestionRepository } from "./suggestion-repository";
import { DrizzleUserRepository } from "./user-repository";
import { DrizzleVoteRepository } from "./vote-repository";
import { DrizzleWorkflowRunRepository } from "./workflow-run-repository";

/**
 * All server-side Drizzle adapters share the same request-scoped database
 * client. Keeping construction here prevents individual consumers from
 * accidentally creating adapters against a different client or transaction.
 */
export type DrizzleRepositories = Readonly<{
  agent: DrizzleAgentRepository;
  artifact: DrizzleArtifactRepository;
  chat: DrizzleChatRepository;
  chatAgentLink: DrizzleChatAgentLinkRepository;
  chatInvitation: DrizzleChatInvitationRepository;
  chatMember: DrizzleChatMemberRepository;
  message: DrizzleMessageRepository;
  organization: DrizzleOrganizationRepository;
  organizationMember: DrizzleOrganizationMemberRepository;
  suggestion: DrizzleSuggestionRepository;
  user: DrizzleUserRepository;
  vote: DrizzleVoteRepository;
  workflowRun: DrizzleWorkflowRunRepository;
}>;

export function createDrizzleRepositories(db: DbInstance): DrizzleRepositories {
  return {
    agent: new DrizzleAgentRepository(db),
    artifact: new DrizzleArtifactRepository(db),
    chat: new DrizzleChatRepository(db),
    chatAgentLink: new DrizzleChatAgentLinkRepository(db),
    chatInvitation: new DrizzleChatInvitationRepository(db),
    chatMember: new DrizzleChatMemberRepository(db),
    message: new DrizzleMessageRepository(db),
    organization: new DrizzleOrganizationRepository(db),
    organizationMember: new DrizzleOrganizationMemberRepository(db),
    suggestion: new DrizzleSuggestionRepository(db),
    user: new DrizzleUserRepository(db),
    vote: new DrizzleVoteRepository(db),
    workflowRun: new DrizzleWorkflowRunRepository(db),
  };
}
