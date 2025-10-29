"use client";

import * as React from "react";
import { ChatInterface } from "@/components/chats";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

interface ChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const [chatId, setChatId] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then(({ id }) => setChatId(id));
  }, [params]);

  if (!chatId) {
    return <div>Loading...</div>;
  }
  return (
    <div className="container mx-auto p-4 h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/chats" aria-label="Back to chat list">
            <ArrowLeftIcon className="h-4 w-4 mr-2" aria-hidden="true" />
            Back to Chats
          </Link>
        </Button>
      </header>

      {/* Chat Interface */}
      <main className="flex-1 min-h-0" role="main" aria-label="Chat conversation">
        <ErrorBoundary>
          <ChatInterface
            chatId={chatId}
            className="h-full"
          />
        </ErrorBoundary>
      </main>
    </div>
  );
}