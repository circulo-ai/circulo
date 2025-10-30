"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import { useState } from "react";

export default function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    transport: new WorkflowChatTransport({
      fetch: (_, init) => {
        return fetch("/api/v1/chats", init);
      },
    }),
  });

  return (
    <div className="stretch mx-auto flex w-full max-w-md flex-col py-24">
      <div className="space-y-4">
        {messages.map((m) => (
          <div key={m.id} className="whitespace-pre-wrap">
            <div>
              <div className="font-bold">{m.role}</div>
              {m.parts.map((part) => {
                switch (part.type) {
                  case "text":
                    return <p key={`${m.id}-${part.type}`}>{part.text}</p>;
                  case "tool-addResource":
                  case "tool-getInformation":
                    return (
                      <div key={`${m.id}-${part.type}`}>
                        call{part.state === "output-available" ? "ed" : "ing"}{" "}
                        tool: {part.type}
                        <pre className="my-4 rounded-sm bg-zinc-100 p-2">
                          {JSON.stringify(part.input, null, 2)}
                        </pre>
                      </div>
                    );
                }
              })}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          className="fixed bottom-0 mb-8 w-full max-w-md rounded border border-gray-300 p-2 shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={(e) => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}
