import { relations } from "drizzle-orm";
import {
  agent,
  agentTemplate,
  tool,
  mcpServer,
} from "@/db/schema/agent";
import { account, session, user } from "@/db/schema/auth";
import {
  knowledgeDocument,
  embedding,
  knowledgeBase,
  documentProcessingQueue,
} from "@/db/schema/knowledge";
import {
  chat,
  chatAgent,
  chatKnowledgeBase,
  chatMember,
  chatInvitation,
  message,
  messageReaction,
  document,
  suggestion,
} from "@/db/schema/chat";

// ==================== USER RELATIONS ====================

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),

  // Agent relations
  agents: many(agent),
  agentTemplates: many(agentTemplate),
  tools: many(tool),
  mcpServers: many(mcpServer),

  // Knowledge relations
  knowledgeBases: many(knowledgeBase),

  // Chat relations
  createdChats: many(chat),
  chatMemberships: many(chatMember),
  sentInvitations: many(chatInvitation, { relationName: "sentInvitations" }),
  receivedInvitations: many(chatInvitation, { relationName: "receivedInvitations" }),
  messages: many(message),
  messageReactions: many(messageReaction),
  documents: many(document),
  suggestions: many(suggestion),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// ==================== AGENT RELATIONS ====================

export const agentTemplateRelations = relations(
  agentTemplate,
  ({ one, many }) => ({
    creator: one(user, {
      fields: [agentTemplate.creatorId],
      references: [user.id],
    }),
    instances: many(agent),
  })
);

export const agentRelations = relations(agent, ({ one, many }) => ({
  user: one(user, {
    fields: [agent.userId],
    references: [user.id],
  }),
  template: one(agentTemplate, {
    fields: [agent.templateId],
    references: [agentTemplate.id],
  }),
  chatAgents: many(chatAgent),
  messages: many(message),
}));

export const toolRelations = relations(tool, ({ one }) => ({
  user: one(user, {
    fields: [tool.userId],
    references: [user.id],
  }),
  mcpServer: one(mcpServer, {
    fields: [tool.mcpServerId],
    references: [mcpServer.id],
  }),
}));

export const mcpServerRelations = relations(mcpServer, ({ one, many }) => ({
  user: one(user, {
    fields: [mcpServer.userId],
    references: [user.id],
  }),
  tools: many(tool),
}));

// ==================== KNOWLEDGE RELATIONS ====================

export const knowledgeBaseRelations = relations(
  knowledgeBase,
  ({ one, many }) => ({
    user: one(user, {
      fields: [knowledgeBase.userId],
      references: [user.id],
    }),
    documents: many(knowledgeDocument),
    embeddings: many(embedding),
    chatKnowledgeBases: many(chatKnowledgeBase),
  })
);

export const knowledgeDocumentRelations = relations(
  knowledgeDocument,
  ({ one, many }) => ({
    knowledgeBase: one(knowledgeBase, {
      fields: [knowledgeDocument.knowledgeBaseId],
      references: [knowledgeBase.id],
    }),
    embeddings: many(embedding),
    processingQueue: one(documentProcessingQueue, {
      fields: [knowledgeDocument.id],
      references: [documentProcessingQueue.documentId],
    }),
  })
);

export const embeddingRelations = relations(embedding, ({ one }) => ({
  knowledgeBase: one(knowledgeBase, {
    fields: [embedding.knowledgeBaseId],
    references: [knowledgeBase.id],
  }),
  document: one(knowledgeDocument, {
    fields: [embedding.documentId],
    references: [knowledgeDocument.id],
  }),
}));

export const documentProcessingQueueRelations = relations(
  documentProcessingQueue,
  ({ one }) => ({
    document: one(knowledgeDocument, {
      fields: [documentProcessingQueue.documentId],
      references: [knowledgeDocument.id],
    }),
  })
);

// ==================== CHAT RELATIONS ====================

export const chatRelations = relations(chat, ({ one, many }) => ({
  creator: one(user, {
    fields: [chat.creatorId],
    references: [user.id],
  }),
  members: many(chatMember),
  invitations: many(chatInvitation),
  messages: many(message),
  chatAgents: many(chatAgent),
  chatKnowledgeBases: many(chatKnowledgeBase),
  documents: many(document),
}));

export const chatMemberRelations = relations(chatMember, ({ one }) => ({
  chat: one(chat, {
    fields: [chatMember.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [chatMember.userId],
    references: [user.id],
  }),
}));

export const chatInvitationRelations = relations(
  chatInvitation,
  ({ one }) => ({
    chat: one(chat, {
      fields: [chatInvitation.chatId],
      references: [chat.id],
    }),
    inviter: one(user, {
      fields: [chatInvitation.inviterId],
      references: [user.id],
      relationName: "sentInvitations",
    }),
    invitee: one(user, {
      fields: [chatInvitation.inviteeId],
      references: [user.id],
      relationName: "receivedInvitations",
    }),
  })
);

export const chatAgentRelations = relations(chatAgent, ({ one }) => ({
  chat: one(chat, {
    fields: [chatAgent.chatId],
    references: [chat.id],
  }),
  agent: one(agent, {
    fields: [chatAgent.agentId],
    references: [agent.id],
  }),
  addedByUser: one(user, {
    fields: [chatAgent.addedBy],
    references: [user.id],
  }),
}));

export const chatKnowledgeBaseRelations = relations(
  chatKnowledgeBase,
  ({ one }) => ({
    chat: one(chat, {
      fields: [chatKnowledgeBase.chatId],
      references: [chat.id],
    }),
    knowledgeBase: one(knowledgeBase, {
      fields: [chatKnowledgeBase.knowledgeBaseId],
      references: [knowledgeBase.id],
    }),
    addedByUser: one(user, {
      fields: [chatKnowledgeBase.addedBy],
      references: [user.id],
    }),
  })
);

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [message.userId],
    references: [user.id],
  }),
  agent: one(agent, {
    fields: [message.agentId],
    references: [agent.id],
  }),
  quotedMessage: one(message, {
    fields: [message.quotedMessageId],
    references: [message.id],
    relationName: "messageQuotes",
  }),
  quotes: many(message, {
    relationName: "messageQuotes",
  }),
  reactions: many(messageReaction),
}));

export const messageReactionRelations = relations(
  messageReaction,
  ({ one }) => ({
    message: one(message, {
      fields: [messageReaction.messageId],
      references: [message.id],
    }),
    user: one(user, {
      fields: [messageReaction.userId],
      references: [user.id],
    }),
  })
);

export const documentRelations = relations(document, ({ one, many }) => ({
  user: one(user, {
    fields: [document.userId],
    references: [user.id],
  }),
  chat: one(chat, {
    fields: [document.chatId],
    references: [chat.id],
  }),
  suggestions: many(suggestion),
}));

export const suggestionRelations = relations(suggestion, ({ one }) => ({
  document: one(document, {
    fields: [suggestion.documentId, suggestion.documentCreatedAt],
    references: [document.id, document.createdAt],
  }),
  user: one(user, {
    fields: [suggestion.userId],
    references: [user.id],
  }),
}));