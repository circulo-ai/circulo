import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { randomUUID } from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export type AuditContext = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditDetails = Record<string, any>;

// ============================================================================
// BASE AUDIT LOGGER
// ============================================================================

class AuditLogger {
  private async log(
    action: string,
    entityType: string,
    entityId: string | null,
    details: AuditDetails,
    context: AuditContext,
  ): Promise<void> {
    try {
      await db.insert(auditLog).values({
        id: randomUUID(),
        userId: context.userId || null,
        action,
        entityType,
        entityId,
        details,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      });
    } catch (error) {
      // Log to your error tracking service but don't throw
      // Audit logs should never break the main flow
      console.error("Failed to create audit log:", error);
    }
  }

  // ============================================================================
  // USER EVENTS
  // ============================================================================

  async userCreated(
    userId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("user.created", "user", userId, details, context);
  }

  async userUpdated(
    userId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("user.updated", "user", userId, details, context);
  }

  async userDeleted(
    userId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("user.deleted", "user", userId, details, context);
  }

  async userLoggedIn(
    userId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("user.logged_in", "user", userId, details, context);
  }

  async userLoggedOut(
    userId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("user.logged_out", "user", userId, details, context);
  }

  // ============================================================================
  // WALLET & TRANSACTION EVENTS
  // ============================================================================

  async walletCreated(
    walletId: string,
    userId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "wallet.created",
      "wallet",
      walletId,
      { userId, ...details },
      context,
    );
  }

  async depositInitiated(
    transactionId: string,
    amount: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.deposit_initiated",
      "transaction",
      transactionId,
      { amount, ...details },
      context,
    );
  }

  async depositCompleted(
    transactionId: string,
    amount: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.deposit_completed",
      "transaction",
      transactionId,
      { amount, ...details },
      context,
    );
  }

  async depositFailed(
    transactionId: string,
    amount: string,
    reason: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.deposit_failed",
      "transaction",
      transactionId,
      { amount, reason, ...details },
      context,
    );
  }

  async withdrawalInitiated(
    transactionId: string,
    amount: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.withdrawal_initiated",
      "transaction",
      transactionId,
      { amount, ...details },
      context,
    );
  }

  async withdrawalCompleted(
    transactionId: string,
    amount: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.withdrawal_completed",
      "transaction",
      transactionId,
      { amount, ...details },
      context,
    );
  }

  async usageCharged(
    transactionId: string,
    amount: string,
    usage: { tokens: number; cost: string },
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.usage_charged",
      "transaction",
      transactionId,
      { amount, usage, ...details },
      context,
    );
  }

  async refundIssued(
    transactionId: string,
    amount: string,
    reason: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "transaction.refund_issued",
      "transaction",
      transactionId,
      { amount, reason, ...details },
      context,
    );
  }

  // ============================================================================
  // AGENT EVENTS
  // ============================================================================

  async agentCreated(
    agentId: string,
    agentName: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "agent.created",
      "agent",
      agentId,
      { name: agentName, ...details },
      context,
    );
  }

  async agentUpdated(
    agentId: string,
    changes: Record<string, any>,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "agent.updated",
      "agent",
      agentId,
      { changes, ...details },
      context,
    );
  }

  async agentDeleted(
    agentId: string,
    agentName: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "agent.deleted",
      "agent",
      agentId,
      { name: agentName, ...details },
      context,
    );
  }

  async agentPublished(
    agentId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("agent.published", "agent", agentId, details, context);
  }

  async agentUnpublished(
    agentId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("agent.unpublished", "agent", agentId, details, context);
  }

  async agentCloned(
    newAgentId: string,
    sourceAgentId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "agent.cloned",
      "agent",
      newAgentId,
      { sourceAgentId, ...details },
      context,
    );
  }

  // ============================================================================
  // KNOWLEDGE BASE EVENTS
  // ============================================================================

  async knowledgeBaseCreated(
    kbId: string,
    kbName: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "knowledge_base.created",
      "knowledge_base",
      kbId,
      { name: kbName, ...details },
      context,
    );
  }

  async knowledgeBaseUpdated(
    kbId: string,
    changes: Record<string, any>,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "knowledge_base.updated",
      "knowledge_base",
      kbId,
      { changes, ...details },
      context,
    );
  }

  async knowledgeBaseDeleted(
    kbId: string,
    kbName: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "knowledge_base.deleted",
      "knowledge_base",
      kbId,
      { name: kbName, ...details },
      context,
    );
  }

  async knowledgeBasePublished(
    kbId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "knowledge_base.published",
      "knowledge_base",
      kbId,
      details,
      context,
    );
  }

  async documentUploaded(
    documentId: string,
    kbId: string,
    filename: string,
    fileSize: number,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "document.uploaded",
      "document",
      documentId,
      { kbId, filename, fileSize, ...details },
      context,
    );
  }

  async documentProcessed(
    documentId: string,
    chunkCount: number,
    tokenCount: number,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "document.processed",
      "document",
      documentId,
      { chunkCount, tokenCount, ...details },
      context,
    );
  }

  async documentProcessingFailed(
    documentId: string,
    error: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "document.processing_failed",
      "document",
      documentId,
      { error, ...details },
      context,
    );
  }

  async documentDeleted(
    documentId: string,
    filename: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "document.deleted",
      "document",
      documentId,
      { filename, ...details },
      context,
    );
  }

  // ============================================================================
  // CHAT EVENTS
  // ============================================================================

  async chatCreated(
    chatId: string,
    chatTitle: string,
    style: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.created",
      "chat",
      chatId,
      { title: chatTitle, style, ...details },
      context,
    );
  }

  async chatUpdated(
    chatId: string,
    changes: Record<string, any>,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.updated",
      "chat",
      chatId,
      { changes, ...details },
      context,
    );
  }

  async chatDeleted(
    chatId: string,
    chatTitle: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.deleted",
      "chat",
      chatId,
      { title: chatTitle, ...details },
      context,
    );
  }

  async chatStarted(
    chatId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("chat.started", "chat", chatId, details, context);
  }

  async chatEnded(
    chatId: string,
    stats: { messageCount: number; totalTokens: number; totalCost: string },
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.ended",
      "chat",
      chatId,
      { stats, ...details },
      context,
    );
  }

  async chatPublished(
    chatId: string,
    shareLink: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.published",
      "chat",
      chatId,
      { shareLink, ...details },
      context,
    );
  }

  async chatUnpublished(
    chatId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log("chat.unpublished", "chat", chatId, details, context);
  }

  async chatShared(
    chatId: string,
    shareLink: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.shared",
      "chat",
      chatId,
      { shareLink, ...details },
      context,
    );
  }

  async chatAgentAdded(
    chatId: string,
    agentId: string,
    speakOrder: number,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.agent_added",
      "chat",
      chatId,
      { agentId, speakOrder, ...details },
      context,
    );
  }

  async chatAgentRemoved(
    chatId: string,
    agentId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.agent_removed",
      "chat",
      chatId,
      { agentId, ...details },
      context,
    );
  }

  async chatAgentReordered(
    chatId: string,
    reorderMap: Record<string, number>,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.agent_reordered",
      "chat",
      chatId,
      { reorderMap, ...details },
      context,
    );
  }

  async chatKnowledgeBaseAdded(
    chatId: string,
    kbId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.knowledge_base_added",
      "chat",
      chatId,
      { kbId, ...details },
      context,
    );
  }

  async chatKnowledgeBaseRemoved(
    chatId: string,
    kbId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "chat.knowledge_base_removed",
      "chat",
      chatId,
      { kbId, ...details },
      context,
    );
  }

  // ============================================================================
  // MESSAGE EVENTS
  // ============================================================================

  async messageSent(
    messageId: string,
    chatId: string,
    senderId: string,
    senderType: "user" | "agent",
    stats: { tokenCount: number; cost: string },
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "message.sent",
      "message",
      messageId,
      {
        chatId,
        senderId,
        senderType,
        stats,
        ...details,
      },
      context,
    );
  }

  async messageEdited(
    messageId: string,
    changes: { oldContent?: string; newContent: string },
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "message.edited",
      "message",
      messageId,
      { changes, ...details },
      context,
    );
  }

  async messageDeleted(
    messageId: string,
    chatId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "message.deleted",
      "message",
      messageId,
      { chatId, ...details },
      context,
    );
  }

  async messageQuoted(
    messageId: string,
    quotedMessageId: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "message.quoted",
      "message",
      messageId,
      { quotedMessageId, ...details },
      context,
    );
  }

  async toolCalled(
    messageId: string,
    toolName: string,
    toolParams: Record<string, any>,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "message.tool_called",
      "message",
      messageId,
      { toolName, toolParams, ...details },
      context,
    );
  }

  async toolResultReceived(
    messageId: string,
    toolName: string,
    success: boolean,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "message.tool_result",
      "message",
      messageId,
      { toolName, success, ...details },
      context,
    );
  }

  // ============================================================================
  // SECURITY EVENTS
  // ============================================================================

  async unauthorizedAccess(
    resource: string,
    resourceId: string,
    attemptedAction: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "security.unauthorized_access",
      resource,
      resourceId,
      { attemptedAction, ...details },
      context,
    );
  }

  async suspiciousActivity(
    activityType: string,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "security.suspicious_activity",
      "security",
      null,
      { activityType, ...details },
      context,
    );
  }

  async rateLimitExceeded(
    resource: string,
    limit: number,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      "security.rate_limit_exceeded",
      resource,
      null,
      { limit, ...details },
      context,
    );
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async batchOperation(
    operationType: string,
    entityType: string,
    entityIds: string[],
    success: boolean,
    details: AuditDetails,
    context: AuditContext,
  ) {
    await this.log(
      `batch.${operationType}`,
      entityType,
      null,
      {
        entityIds,
        count: entityIds.length,
        success,
        ...details,
      },
      context,
    );
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const audit = new AuditLogger();

// ============================================================================
// HELPER TO EXTRACT CONTEXT FROM REQUEST
// ============================================================================

export function getAuditContext(
  request: Request,
  userId?: string,
): AuditContext {
  return {
    userId,
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown",
    userAgent: request.headers.get("user-agent") || undefined,
  };
}

// For Next.js App Router (Server Actions & Route Handlers)
export async function getAuditContextFromHeaders(
  userId?: string,
): Promise<AuditContext> {
  const { headers } = await import("next/headers");
  const headersList = await headers();

  return {
    userId,
    ipAddress:
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "unknown",
    userAgent: headersList.get("user-agent") || undefined,
  };
}

// For Next.js Pages Router (API Routes)
export function getAuditContextFromNextRequest(
  req: { headers: { [key: string]: string | string[] | undefined } },
  userId?: string,
): AuditContext {
  const getHeader = (name: string): string | undefined => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    userId,
    ipAddress:
      getHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      getHeader("x-real-ip") ||
      "unknown",
    userAgent: getHeader("user-agent") || undefined,
  };
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Example 1: Next.js App Router - Route Handler
// app/api/v1/chat/route.ts
export async function POST(request: Request) {
  const session = await getSession();
  const context = getAuditContext(request, session?.userId);
  
  await audit.chatCreated(
    chat.id,
    'AI Brainstorm Session',
    'brainstorm',
    { agentCount: 3, visibility: 'public' },
    context
  );
}

// Example 2: Next.js App Router - Server Action
// app/actions/chat.ts
'use server'
export async function createChat(data: NewChat) {
  const session = await getSession();
  const context = await getAuditContextFromHeaders(session?.userId);
  
  await audit.chatCreated(
    chat.id,
    data.title,
    data.style,
    { visibility: data.visibility },
    context
  );
}

// Example 3: Next.js Pages Router - API Route
// pages/api/v1/chat/index.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);
  const context = getAuditContextFromNextRequest(req, session?.userId);
  
  await audit.chatCreated(
    chat.id,
    'AI Brainstorm Session',
    'brainstorm',
    { agentCount: 3 },
    context
  );
}

// Example 4: Message sent with cost (App Router)
export async function POST(request: Request) {
  const context = getAuditContext(request, userId);
  
  await audit.messageSent(
    message.id,
    chat.id,
    agent.id,
    'agent',
    { tokenCount: 150, cost: '0.0023' },
    { model: 'gpt-4', temperature: 0.7 },
    context
  );
}

// Example 5: Deposit completed (Server Action)
'use server'
export async function completeDeposit(transactionId: string, amount: string) {
  const session = await getSession();
  const context = await getAuditContextFromHeaders(session?.userId);
  
  await audit.depositCompleted(
    transactionId,
    amount,
    { paymentMethod: 'stripe', stripePaymentId: 'pi_xxx' },
    context
  );
}

// Example 6: Unauthorized access attempt
export async function GET(request: Request) {
  const session = await getSession();
  const context = getAuditContext(request, session?.userId);
  
  await audit.unauthorizedAccess(
    'chat',
    chatId,
    'view',
    { reason: 'chat is private', attemptedBy: session?.userId },
    context
  );
}

// Example 7: Knowledge base document processing (Server Action)
'use server'
export async function processDocument(documentId: string) {
  const session = await getSession();
  const context = await getAuditContextFromHeaders(session?.userId);
  
  await audit.documentProcessed(
    documentId,
    42,
    15000,
    { filename: 'research.pdf', embeddingModel: 'text-embedding-3-small' },
    context
  );
}

// Example 8: Agent published to community
'use server'
export async function publishAgent(agentId: string) {
  const session = await getSession();
  const context = await getAuditContextFromHeaders(session?.userId);
  
  await audit.agentPublished(
    agentId,
    { name: 'Research Assistant', model: 'gpt-4' },
    context
  );
}
*/
