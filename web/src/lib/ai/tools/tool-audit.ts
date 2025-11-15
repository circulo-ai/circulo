// lib/audit/tool-audit.ts
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import { generateUUID } from "@/lib/utils";

const logger = createLogger("ToolAudit");

export interface ToolExecutionAudit {
  id: string;
  userId: string;
  agentId?: string;
  chatId: string;
  toolId: string;
  toolName: string;
  toolType: string;
  parameters: Record<string, any>;
  result: {
    success: boolean;
    data?: any;
    error?: string;
  };
  executionTime: number;
  tokensUsed?: number;
  cost?: number;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

class ToolAuditSystem {
  private pendingAudits: ToolExecutionAudit[] = [];
  private batchSize = 50;
  private flushInterval = 5000; // 5 seconds

  constructor() {
    // Start periodic flush
    setInterval(() => this.flush(), this.flushInterval);
  }

  /**
   * Log tool execution
   */
  async log(
    audit: Omit<ToolExecutionAudit, "id" | "timestamp">,
  ): Promise<void> {
    const fullAudit: ToolExecutionAudit = {
      ...audit,
      id: generateUUID(),
      timestamp: new Date(),
    };

    this.pendingAudits.push(fullAudit);

    // Flush if batch size reached
    if (this.pendingAudits.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush pending audits to database
   */
  private async flush(): Promise<void> {
    if (this.pendingAudits.length === 0) return;

    const toFlush = [...this.pendingAudits];
    this.pendingAudits = [];

    try {
      await db.insert(auditLog).values(
        toFlush.map((audit) => ({
          id: audit.id,
          entityType: "tool_execution",
          entityId: audit.toolId,
          action: "execute",
          actorId: audit.userId,
          actorType: "user",
          changes: {
            agentId: audit.agentId,
            chatId: audit.chatId,
            toolName: audit.toolName,
            toolType: audit.toolType,
            parameters: audit.parameters,
            result: audit.result,
            executionTime: audit.executionTime,
            tokensUsed: audit.tokensUsed,
            cost: audit.cost,
          },
          metadata: null,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        })),
      );

      logger.debug(`Flushed ${toFlush.length} audit logs to database`);
    } catch (error) {
      logger.error("Failed to flush audit logs", error);
      // Put them back in the queue
      this.pendingAudits.unshift(...toFlush);
    }
  }

  /**
   * Get tool usage analytics
   */
  async getToolAnalytics(userId: string, timeframe: "day" | "week" | "month") {
    const now = new Date();
    const startDate = new Date();

    switch (timeframe) {
      case "day":
        startDate.setDate(now.getDate() - 1);
        break;
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    // Query audit logs for analytics
    const logs = await db.query.auditLog.findMany({
      where: (logs, { and, eq, gte }) =>
        and(
          eq(logs.actorId, userId),
          eq(logs.entityType, "tool_execution"),
          gte(logs.createdAt, startDate),
        ),
    });

    // Aggregate statistics
    const stats = {
      totalExecutions: logs.length,
      successRate: 0,
      averageExecutionTime: 0,
      totalCost: 0,
      toolBreakdown: {} as Record<string, number>,
      errorBreakdown: {} as Record<string, number>,
    };

    let successCount = 0;
    let totalTime = 0;

    for (const log of logs) {
      const changes = log.changes as any;

      if (changes.result?.success) {
        successCount++;
      } else {
        const error = changes.result?.error || "Unknown error";
        stats.errorBreakdown[error] = (stats.errorBreakdown[error] || 0) + 1;
      }

      totalTime += changes.executionTime || 0;
      stats.totalCost += changes.cost || 0;

      const toolName = changes.toolName;
      stats.toolBreakdown[toolName] = (stats.toolBreakdown[toolName] || 0) + 1;
    }

    stats.successRate = logs.length > 0 ? successCount / logs.length : 0;
    stats.averageExecutionTime = logs.length > 0 ? totalTime / logs.length : 0;

    return stats;
  }

  /**
   * Get recent tool executions
   */
  async getRecentExecutions(
    userId: string,
    limit: number = 20,
  ): Promise<ToolExecutionAudit[]> {
    const logs = await db.query.auditLog.findMany({
      where: (logs, { and, eq }) =>
        and(eq(logs.actorId, userId), eq(logs.entityType, "tool_execution")),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
      limit,
    });

    return logs.map((log) => {
      const changes = log.changes as any;
      return {
        id: log.id,
        userId: log.actorId!,
        agentId: changes.agentId,
        chatId: changes.chatId,
        toolId: log.entityId,
        toolName: changes.toolName,
        toolType: changes.toolType,
        parameters: changes.parameters,
        result: changes.result,
        executionTime: changes.executionTime,
        tokensUsed: changes.tokensUsed,
        cost: changes.cost,
        timestamp: log.createdAt,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
      };
    });
  }
}

export const toolAudit = new ToolAuditSystem();
