import { db } from "@/db";
import { createLogger } from "@/lib/logs/console/logger";

const logger = createLogger("ToolPermissions");

export interface ToolPermission {
  userId: string;
  toolId: string;
  canExecute: boolean;
  rateLimit?: number; // executions per hour
  costLimit?: number; // max cost per execution
}

class ToolPermissionSystem {
  private executionCounts = new Map<string, { count: number; resetAt: Date }>();

  async canExecuteTool(
    userId: string,
    toolId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check rate limits
    const key = `${userId}:${toolId}`;
    const stats = this.executionCounts.get(key);

    if (stats) {
      if (new Date() < stats.resetAt) {
        if (stats.count >= 100) {
          // Default limit
          return {
            allowed: false,
            reason: "Rate limit exceeded. Try again later.",
          };
        }
      } else {
        // Reset counter
        this.executionCounts.delete(key);
      }
    }

    return { allowed: true };
  }

  trackExecution(userId: string, toolId: string): void {
    const key = `${userId}:${toolId}`;
    const stats = this.executionCounts.get(key);

    if (stats) {
      stats.count++;
    } else {
      const resetAt = new Date();
      resetAt.setHours(resetAt.getHours() + 1);
      this.executionCounts.set(key, { count: 1, resetAt });
    }
  }
}

export const toolPermissions = new ToolPermissionSystem();