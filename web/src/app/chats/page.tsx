"use client";

import { useState } from "react";
import { ChatList, ChatInterface } from "@/components/chats";
import { ErrorBoundary } from "@/components/error-boundary";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircleIcon } from "lucide-react";

export default function ChatsPage() {
  const [selectedChatId, setSelectedChatId] = useState<string>("");

  return (
    <div className="container mx-auto p-4 h-screen flex flex-col">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Chat List */}
        <div className="lg:col-span-1" role="navigation" aria-label="Chat list">
          <ErrorBoundary>
            <ChatList
              selectedChatId={selectedChatId}
              onChatSelect={setSelectedChatId}
              className="h-full"
            />
          </ErrorBoundary>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-2" role="main" aria-label="Chat conversation">
          <ErrorBoundary>
            {selectedChatId ? (
              <ChatInterface
                chatId={selectedChatId}
                className="h-full"
              />
            ) : (
              <Card className="h-full">
                <CardContent className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <MessageCircleIcon 
                    className="h-16 w-16 text-muted-foreground mb-4" 
                    aria-hidden="true"
                  />
                  <h2 className="text-2xl font-semibold mb-2">Welcome to Chats</h2>
                  <p className="text-muted-foreground max-w-md">
                    Select a chat from the sidebar to start a conversation, or create a new chat to get started.
                  </p>
                </CardContent>
              </Card>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}