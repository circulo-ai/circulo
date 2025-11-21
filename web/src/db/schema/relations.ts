import { relations } from "drizzle-orm";

// Auth
import {
  account,
  apiKey,
  invitation,
  member,
  organization,
  permissions,
  session,
  user,
} from "@/db/schema/auth";

// Agent
import { agent } from "@/db/schema/agent";

// Tools
import {
  agentToolConfig,
  customTool,
  mcpServer,
  mcpServerToo,
} from "@/db/schema/tools";

// Knowledge
import {
  documentProcessingQueue,
  embedding,
  knowledgeBase,
  knowledgeDocumen,
} from "@/db/schema/knowledge";

// Chat
import {
  chat,
  chatAgent,
  chatInvitation,
  chatKnowledgeBase,
  chatMember,
  document,
  message,
  messageReaction,
  suggestion,
} from "@/db/schema/chat";

// Environment
import {
  chatEnvironment,
  organizationEnvironment,
  userEnvironment,
} from "@/db/schema/environment";

// Billing
import {
  invoice,
  invoiceLineItem,
  subscription,
  subscriptionHistory,
  subscriptionPlan,
  usageMetric,
} from "@/db/schema/billing";

// ==================== USER RELATIONS ====================
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(member),
  sentInvitations: many(invitation),
  apiKeys: many(apiKey),
  permissions: many(permissions),

  // Created entities
  createdAgents: many(agent),
  createdChats: many(chat),

  // Chat participation
  chatMemberships: many(chatMember),
  messages: many(message),
  messageReactions: many(messageReaction),
  documents: many(document),
  suggestions: many(suggestion),

  // Settings
  environment: one(userEnvironment, {
    fields: [user.id],
    references: [userEnvironment.userId],
  }),

  // Billing
  subscriptions: many(subscription),
  invoices: many(invoice),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] ),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] })
}));

// ==================== ORGANIZATION RELATIONS ====================
export const organizationRelations = relations(
  organization,
  ({ many, one }) => ({
    members: many(member),
    invitations: many(invitation),
    apiKeys: many(apiKey),

    // Owned entities
    agents: many(agent),
    chats: many(chat),
    customTools: many(customTool),
    knowledgeBases: many(knowledgeBase),

    // Environment
    environment: one(organizationEnvironment, {
      fields: [organization.id],
      references: [organizationEnvironment.organizationId]
    })
  })
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(user, { fields: [apiKey.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id]
  })
}));

export const memberRelations = relations(member, ({ one }) => ({
  user: one(user, { fields: [member.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id]
  })
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  inviter: one(user, { fields: [invitation.inviterId], references: [user.id] }),
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id]
  }),
}));

// ==================== AGENT RELATIONS ====================
export const agentRelations = relations(agent, ({ one, many }) => ({
  organization: one(organization, {
    fields: [agent.organizationId],
    references: [organization.id]
  }),
  creator: one(user, { fields: [agent.createdBy], references: [user.id] }),

  chatAgents: many(chatAgent),
  toolConfigs: many(agentToolConfig)
}));

// ==================== TOOL RELATIONS ====================
export const customToolRelations = relations(customTool, ({ one }) => ({
  organization: one(organization, {
    fields: [customTool.organizationId],
    references: [organization.id]
  }),
  creator: one(user, { fields: [customTool.userId], references: [user.id] })
}));

export const mcpServerRelations = relations(mcpServer, ({ one, many }) => ({
  chat: one(chat, { fields: [mcpServer.chatId], references: [chat.id] }),
  creator: one(user, { fields: [mcpServer.createdBy], references: [user.id] }),
  tools: many(mcpServerTool)
}));

export const mcpServerToolRelations = relations(mcpServerTool, ({ one }) => ({
  server: one(mcpServer, {
    fields: [mcpServerTool.mcpServerId],
    references: [mcpServer.id]
  }),
}));

export const agentToolConfigRelations = relations(
  agentToolConfig,
  ({ one }) => ({
    agent: one(agent, {
      fields: [agentToolConfig.agentId],
      references: [agent.id]
    })
  })
);

// ==================== KNOWLEDGE RELATIONS ====================
export const knowledgeBaseRelations = relations(
  knowledgeBase,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [knowledgeBase.organizationId],
      references: [organization.id]
    }),
    creator: one(user, {
      fields: [knowledgeBase.createdBy],
      references: [user.id],
    }),
    documents: many(knowledgeDocument),
    embeddings: many(embedding),
    chatKnowledgeBases: many(chatKnowledgeBase),
  }),
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
  }),
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
  }),
);

// ==================== CHAT RELATIONS ====================
export const chatRelations = relations(chat, ({ one, many }) => ({
  organization: one(organization, {
    fields: [chat.organizationId],
    references: [organization.id]
  }),
  creator: one(user, { fields: [chat.creatorId], references: [user.id] }),

  members: many(chatMember),
  invitations: many(chatInvitation),
  messages: many(message),
  chatAgents: many(chatAgent),
  chatKnowledgeBases: many(chatKnowledgeBase),
  mcpServers: many(mcpServer),
  documents: many(document),

  environment: one(chatEnvironment, {
    fields: [chat.id],
    references: [chatEnvironment.chatId]
  })
}));

export const chatMemberRelations = relations(chatMember, ({ one }) => ({
  chat: one(chat, { fields: [chatMember.chatId], references: [chat.id] }),
  user: one(user, { fields: [chatMember.userId], references: [user.id] })
}));

export const chatInvitationRelations = relations(chatInvitation, ({ one }) => ({
  chat: one(chat, { fields: [chatInvitation.chatId], references: [chat.id] }),
  inviter: one(user, {
    fields: [chatInvitation.inviterId],
    references: [user.id],
  }),
  invitee: one(user, {
    fields: [chatInvitation.inviteeId],
    references: [user.id],
  }),
}));

export const chatAgentRelations = relations(chatAgent, ({ one }) => ({
  chat: one(chat, { fields: [chatAgent.chatId], references: [chat.id] }),
  agent: one(agent, { fields: [chatAgent.agentId], references: [agent.id] }),
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
  }),
);

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, { fields: [message.chatId], references: [chat.id] }),
  quotedMessage: one(message, {
    fields: [message.quotedMessageId],
    references: [message.id],
    relationName: "messageQuotes",
  }),
  quotes: many(message, { relationName: "messageQuotes" }),
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
  }),
);

export const documentRelations = relations(document, ({ one, many }) => ({
  user: one(user, { fields: [document.userId], references: [user.id] }),
  chat: one(chat, { fields: [document.chatId], references: [chat.id] }),
  suggestions: many(suggestion),
}));

export const suggestionRelations = relations(suggestion, ({ one }) => ({
  document: one(document, {
    fields: [suggestion.documentId],
    references: [document.id]
  }),
  user: one(user, { fields: [suggestion.userId], references: [user.id] })
}));

// ==================== BILLING RELATIONS ====================
export const subscriptionPlanRelations = relations(
  subscriptionPlan,
  ({ many }) => ({
    subscriptions: many(subscription),
    history: many(subscriptionHistory)
  }),
);

export const subscriptionRelations = relations(
  subscription,
  ({ one, many }) => ({
    user: one(user, { fields: [subscription.userId], references: [user.id] }),
    plan: one(subscriptionPlan, {
      fields: [subscription.planId],
      references: [subscriptionPlan.id]
    }),
    invoices: many(invoice),
    history: many(subscriptionHistory),
    usageMetrics: many(usageMetric)
  })
);

export const subscriptionHistoryRelations = relations(
  subscriptionHistory,
  ({ one }) => ({
    subscription: one(subscription, {
      fields: [subscriptionHistory.subscriptionId],
      references: [subscription.id]
    }),
    plan: one(subscriptionPlan, {
      fields: [subscriptionHistory.planId],
      references: [subscriptionPlan.id]
    })
  })
);

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  user: one(user, { fields: [invoice.userId], references: [user.id] }),
  subscription: one(subscription, {
    fields: [invoice.subscriptionId],
    references: [subscription.id]
  }),
  lineItems: many(invoiceLineItem)
}));

export const invoiceLineItemRelations = relations(
  invoiceLineItem,
  ({ one }) => ({
    invoice: one(invoice, {
      fields: [invoiceLineItem.invoiceId],
      references: [invoice.id]
    })
  })
);

export const usageMetricRelations = relations(usageMetric, ({ one }) => ({
  user: one(user, { fields: [usageMetric.userId], references: [user.id] }),
  subscription: one(subscription, {
    fields: [usageMetric.subscriptionId],
    references: [subscription.id]
  }),
}));
