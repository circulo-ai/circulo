import { relations } from "drizzle-orm";
import { agent, agentPurchase, agentReview, agentTemplate } from "@/db/schema/agent";
import { account, session, user } from "@/db/schema/auth";
import { knowledgeDocument, embedding, knowledgeBase } from "@/db/schema/knowledge";
import { chat, chatAgent, chatKnowledgeBase, message } from "@/db/schema/chat";

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  agents: many(agent),
  agentTemplates: many(agentTemplate),
  agentPurchases: many(agentPurchase),
  agentReviews: many(agentReview),
  knowledgeBases: many(knowledgeBase),
  chats: many(chat),
  messages: many(message),
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

// Agent Template Relations
export const agentTemplateRelations = relations(agentTemplate, ({ one, many }) => ({
  creator: one(user, {
    fields: [agentTemplate.creatorId],
    references: [user.id],
  }),
  instances: many(agent),
  purchases: many(agentPurchase),
  reviews: many(agentReview),
}));

// Agent Relations
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

// Agent Purchase Relations
export const agentPurchaseRelations = relations(agentPurchase, ({ one, many }) => ({
  buyer: one(user, {
    fields: [agentPurchase.buyerId],
    references: [user.id],
  }),
  template: one(agentTemplate, {
    fields: [agentPurchase.templateId],
    references: [agentTemplate.id],
  }),
  agent: one(agent, {
    fields: [agentPurchase.agentId],
    references: [agent.id],
  }),
  reviews: many(agentReview),
}));

// Agent Review Relations
export const agentReviewRelations = relations(agentReview, ({ one }) => ({
  template: one(agentTemplate, {
    fields: [agentReview.templateId],
    references: [agentTemplate.id],
  }),
  user: one(user, {
    fields: [agentReview.userId],
    references: [user.id],
  }),
  purchase: one(agentPurchase, {
    fields: [agentReview.purchaseId],
    references: [agentPurchase.id],
  }),
}));

// Knowledge Base Relations
export const knowledgeBaseRelations = relations(
  knowledgeBase,
  ({ one, many }) => ({
    user: one(user, {
      fields: [knowledgeBase.userId],
      references: [user.id],
    }),
    documents: many(knowledgeDocument),
    chatKnowledgeBases: many(chatKnowledgeBase),
  }),
);

export const knowledgeDocumentDocumentRelations = relations(knowledgeDocument, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBase, {
    fields: [knowledgeDocument.knowledgeBaseId],
    references: [knowledgeBase.id],
  }),
  embeddings: many(embedding),
}));

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

// Chat Relations
export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(message),
  chatAgents: many(chatAgent),
  chatKnowledgeBases: many(chatKnowledgeBase),
}));

export const chatAgentRelations = relations(chatAgent, ({ one }) => ({
  chat: one(chat, {
    fields: [chatAgent.chatId],
    references: [chat.id],
  }),
  agent: one(agent, {
    fields: [chatAgent.agentId],
    references: [agent.id],
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
  }),
);

// Message Relations
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
}));
