// workflows/orchestration/steps/notify-chat-members-step.ts
import { chatMemberRepo } from "@/db/repositories";

export async function notifyChatMembersStep(params: {
  chatId: string;
  excludeUserId: string;
  notification: {
    type: string;
    agentCount: number;
    summary: string;
  };
}): Promise<void> {
  "use step";

  const { chatId, excludeUserId, notification } = params;

  // Get all chat members except the trigger user
  const members = await chatMemberRepo.findForChat(chatId);
  const membersToNotify = members.filter(
    (m) => m.userId !== excludeUserId && m.notificationsEnabled,
  );

  // In a production implementation, you would send notifications via:
  // - Email
  // - Push notifications
  // - WebSocket events
  // - etc.

  console.log(
    `Notifying ${membersToNotify.length} members of orchestration completion`,
  );

  // TODO: Implement actual notification logic
  // For now, just log
  for (const member of membersToNotify) {
    console.log(`Would notify ${member.userId}: ${notification.summary}`);
  }
}
