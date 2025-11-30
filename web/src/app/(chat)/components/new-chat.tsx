"use client";

import { DataStreamHandler } from "@/components/data-stream-handler";
import { PageSpinner } from "@/components/page-spinner";
import {
  CustomInputGroup,
  CustomInputGroupInput,
} from "@/components/ui-custom/input-group";
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { ArrowUp, Mic, Plus } from "lucide-react";

interface ChatProps {
  id: string;
}

export function NewChat({}: ChatProps) {
  const { isChatLoading } = useChatHistoryStore();

  if (isChatLoading) return <PageSpinner />; // TODO replace with skeleton

  return (
    <div className="h-full">
      <article className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-8 p-8">
        <h1 className="text-3xl">This text will be replaced</h1>
        <CustomInputGroup className="h-14 bg-sidebar!">
          <CustomInputGroupInput placeholder=" Your first message (optional)" />
          <InputGroupAddon align="inline-start" className="ml-0!">
            <InputGroupButton
              aria-label="Add files and more"
              size="icon-md"
              variant="ghost-sidebar" // TODO change the variant's name so it's more generic
              className="rounded-full"
            >
              <Plus />
            </InputGroupButton>
          </InputGroupAddon>

          <InputGroupAddon align="inline-end" className="mr-0!">
            <InputGroupButton
              aria-label="Dictate"
              size="icon-md"
              variant="ghost-sidebar"
              className="rounded-full"
            >
              <Mic />
            </InputGroupButton>
            <InputGroupButton
              aria-label="Submit"
              size="icon-md"
              variant="primary"
              className="rounded-full"
            >
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </CustomInputGroup>
      </article>
      <DataStreamHandler />
    </div>
  );
}

// TODO maybe add forms wherever there are inputs
