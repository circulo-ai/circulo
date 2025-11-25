import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { chatRepo, messageRepo } from "@/db/repositories";
import { getSession } from "@/lib/auth";
import { convertToUIMessages } from "@/lib/utils";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await chatRepo.findById(id);

  if (!chat) {
    notFound();
  }

  const session = await getSession();

  if (!session) {
    redirect("/auth/sign-up");
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.creatorId) {
      return notFound();
    }
  }

  const messagesFromDb = await messageRepo.findForChat(id);

  const uiMessages = convertToUIMessages(messagesFromDb);

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={uiMessages}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.creatorId}
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
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.creatorId}
      />
      <DataStreamHandler />
    </>
  );
}
