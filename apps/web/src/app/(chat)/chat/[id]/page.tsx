import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { Chat } from "@/components/chat";
import type { ChatMessagePagination } from "@/hooks/api/chats/use-message-pagination";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { convertToUIMessages } from "@/lib/utils";
import {
  chatMemberRepo,
  chatRepo,
  messageRepo,
} from "@circulo-ai/db/repositories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getRequestUserId(): Promise<string | null> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  if (!cookie) return null;

  const apiBaseUrl =
    process.env.SERVER_API_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "http://localhost:3002";
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const session = (await response.json()) as {
      user?: { id?: string } | null;
    } | null;
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const userId = await getRequestUserId();
  if (!userId || !(await chatMemberRepo.isMember(userId, id))) {
    notFound();
  }
  const chat = await chatRepo.findById(id);

  if (!chat || chat.isDeleted) {
    notFound();
  }

  const messagePage = await messageRepo.findWithCursor(id, {
    direction: "before",
    limit: 50,
  });

  const uiMessages = convertToUIMessages(messagePage.items);
  const messagePagination: ChatMessagePagination = {
    cursor: messagePage.nextCursor,
    hasMore: messagePage.hasMore,
  };

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={uiMessages}
          initialMessagePagination={messagePagination}
          initialVisibilityType={chat.visibility}
          isReadonly={false}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        id={chat.id}
        initialChatModel={chatModelFromCookie.value}
        initialMessages={uiMessages}
        initialMessagePagination={messagePagination}
        initialVisibilityType={chat.visibility}
        isReadonly={false}
      />
      <DataStreamHandler />
    </>
  );
}
