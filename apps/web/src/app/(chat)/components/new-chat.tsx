"use client";

import { DataStreamHandler } from "@/components/data-stream-handler";
import { PageSpinner } from "@/components/page-spinner";
import { PreviewAttachment } from "@/components/preview-attachment";
import { getChatHistoryPaginationKey } from "@/components/sidebar/sidebar-history";
import {
  CustomContextMenuContent,
  CustomContextMenuItem,
} from "@/components/ui-custom/context-menu";
import { ControlledInput } from "@/components/ui-custom/controlled-input";
import { EnhancedImage } from "@/components/ui-custom/enhanced-image";
import { CustomForm } from "@/components/ui-custom/form";
import {
  CustomInputGroup,
  CustomInputGroupInput,
} from "@/components/ui-custom/input-group";
import { Ripple } from "@/components/ui-custom/ripple";
import {
  Route,
  RouteFlowController,
  RouteViewHeader,
  useRouteFlowViewContext,
} from "@/components/ui-custom/route-flow-controller";
import { CustomScrollArea } from "@/components/ui-custom/scroll-area";
import { SelectInput } from "@/components/ui-custom/select";
import { SliderInput } from "@/components/ui-custom/slider";
import { Submit } from "@/components/ui-custom/submit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AnimatedItem, AnimatedList } from "@/components/ui/animated-list";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileInput } from "@/components/uploads/file-input";
import { VoiceRecordingIndicator } from "@/components/voice-recording-indicator";
import { useMergedRefs } from "@/hooks/use-merged-refs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUploadTaskManager } from "@/hooks/use-upload-task-manager";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { ApiRequestError } from "@/lib/api/client";
import { attachmentFromUploadTask } from "@/lib/attachments";
import { deepReplace } from "@/lib/deep-replace";
import { defaultModelForProvider } from "@/lib/ai-providers";
import {
  clearCachePattern,
  fetchWithErrorHandlers,
  getFetcher,
  globalMutate,
} from "@/lib/swr";
import type { Attachment } from "@/lib/types";
import { cn, generateUUID } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { useChat } from "@ai-sdk/react";
import { Agent } from "@circulo-ai/db";
import {
  createAgentBodySchema,
  defaultModel,
  deleteAgentParamsSchema,
  deleteAgentQuerySchema,
  updateAgentBodySchema,
} from "@circulo-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { DefaultChatTransport } from "ai";
import {
  ArrowUp,
  Bot,
  Check,
  CircleFadingArrowUp,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Square,
  TextAlignJustify,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ComponentProps,
  createContext,
  Dispatch,
  forwardRef,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Path, useForm, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import useSWR, { Key, useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import useSWRMutation from "swr/mutation";
import { useLocalStorage } from "usehooks-ts";
import z from "zod";

// ---- Shared context for agent selection ----
interface AgentSelectionContextValue {
  selectedAgentIds: string[];
  setSelectedAgentIds: Dispatch<SetStateAction<string[]>>;
}
const AgentSelectionContext = createContext<AgentSelectionContextValue>({
  selectedAgentIds: [],
  setSelectedAgentIds: () => {},
});

const route: Route = {
  id: "select-agents",
  view: SelectAgents,
  children: [
    { id: "agent-form", view: AgentForm },
    { id: "remove-agent", view: RemoveAgent },
  ],
};

const SELECTED_AGENT_IDS_STORAGE_KEY = "new-chat-selected-agent-ids";

interface NewChatProps {
  id: string;
}

export function NewChat({ id }: NewChatProps) {
  const [chatId] = useState(() => id ?? generateUUID());
  const [selectedAgentIds, setSelectedAgentIds] = useLocalStorage<string[]>(
    SELECTED_AGENT_IDS_STORAGE_KEY,
    [],
  );
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isReadingAttachments, setIsReadingAttachments] = useState(false);
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { setCurrentChatId } = useChatHistoryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadManager = useUploadTaskManager({
    defaultStorageContext: "chat",
  });

  useEffect(() => {
    let active = true;
    const completedTasks = uploadManager.uploadTasks.filter(
      (task) => task.status === "success" && task.url,
    );
    setIsReadingAttachments(completedTasks.length > 0);
    void Promise.all(completedTasks.map(attachmentFromUploadTask)).then(
      (completedAttachments) => {
        if (!active) return;
        setAttachments((previous) => {
          const map = new Map(
            previous.map((attachment) => [attachment.url, attachment]),
          );
          completedAttachments.forEach((attachment) => {
            if (attachment) map.set(attachment.url, attachment);
          });
          return Array.from(map.values());
        });
        setIsReadingAttachments(false);
      },
    );
    return () => {
      active = false;
    };
  }, [uploadManager.uploadTasks]);

  const voiceRecorder = useVoiceRecorder({
    onRecordingComplete: (file, transcript) => {
      if (transcript?.trim()) {
        setInputText(
          (current) =>
            `${current}${current.trim() ? " " : ""}${transcript.trim()}`,
        );
        return;
      }
      uploadManager.enqueueUploads([file], "chat");
    },
    onRecordingError: (error) => toast.error(error.message),
  });

  // Use a ref so the transport closure always reads the latest agentIds at send time
  const selectedAgentIdsRef = useRef<string[]>([]);
  useEffect(() => {
    selectedAgentIdsRef.current = selectedAgentIds;
  }, [selectedAgentIds]);

  useEffect(() => {
    setCurrentChatId(undefined);
  }, [setCurrentChatId]);

  const chatFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetchWithErrorHandlers(input, init);
      const workflowRunId = response.headers.get("x-workflow-run-id");
      if (workflowRunId) {
        localStorage.setItem(`active-workflow-run-id:${chatId}`, workflowRunId);
        router.push(`/chat/${chatId}`, { scroll: false });
        setCurrentChatId(chatId);

        // The routed chat page reconnects to the durable workflow stream. Do
        // not let this transient new-chat consumer continue receiving the
        // same chunks while the route transition is mounting; otherwise the
        // first partial response can be concatenated with the replayed one.
        try {
          await response.body?.cancel();
        } catch {
          // The route transition may already have detached the response.
        }
        return new Response(null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return response;
    },
    [chatId, router, setCurrentChatId],
  );

  const { sendMessage, status } = useChat({
    id: chatId,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: chatFetch,
      prepareSendMessagesRequest: (config) => ({
        ...config,
        body: {
          ...config.body,
          id: config.id,
          message: (() => {
            const message = config.messages.at(-1);
            if (!message) {
              throw new Error("No message to send");
            }
            return {
              ...message,
              id: message.id ?? generateUUID(),
            };
          })(),
          agentIds: selectedAgentIdsRef.current,
        },
      }),
    }),
    onFinish: async () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      await clearCachePattern(/\/api\/conversations.*/);
      await globalMutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/conversations"),
      );
      setSelectedAgentIds([]);
    },
  });

  const handleSubmit = useCallback(() => {
    if (status === "submitted" || status === "streaming") {
      return;
    }

    const text = inputText.trim();
    const hasActiveUploads = uploadManager.uploadTasks.some((task) =>
      ["queued", "preparing", "uploading"].includes(task.status),
    );
    if (
      hasActiveUploads ||
      uploadManager.hasUploadErrors ||
      isReadingAttachments ||
      voiceRecorder.isRecording
    ) {
      return;
    }
    if (!text && attachments.length === 0) return;
    setInputText("");
    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.dataUrl ?? attachment.url,
          filename: attachment.name,
          mediaType: attachment.contentType,
          downloadUrl: attachment.downloadUrl,
        })),
        ...(text ? [{ type: "text" as const, text }] : []),
      ],
    });
    uploadManager.resetAllUploadTasks();
    setAttachments([]);
  }, [
    attachments,
    inputText,
    isReadingAttachments,
    sendMessage,
    status,
    uploadManager,
    voiceRecorder.isRecording,
  ]);

  const agentPanel = (
    <div className="relative h-full overflow-hidden bg-sidebar">
      <RouteFlowController route={route} />
    </div>
  );

  const selectedAgentCount = selectedAgentIds.length;
  const agentSelectionButton = (
    <span className="relative inline-flex">
      <InputGroupButton
        aria-label={
          selectedAgentCount > 0
            ? `${selectedAgentCount} AI agents selected`
            : "Select AI Agents"
        }
        size="icon-md"
        variant="ghost-sidebar"
        className="rounded-full"
      >
        <Bot />
      </InputGroupButton>
      {selectedAgentCount > 0 && (
        <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-[3px] text-[10px] leading-none font-semibold text-white">
          {selectedAgentCount}
        </span>
      )}
    </span>
  );

  return (
    // Single top-level provider so both desktop panel and mobile Sheet share the same state
    <AgentSelectionContext.Provider
      value={{ selectedAgentIds, setSelectedAgentIds }}
    >
      <div className="flex h-full overflow-hidden">
        <article className="relative mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-8 p-4 sm:p-8">
          {isMobile && (
            <Button
              aria-label="Open chat history"
              className="absolute top-3 left-3 z-20 min-h-11 min-w-11"
              onClick={() => setOpenMobile(true)}
              size="icon"
              title="Open chat history"
              variant="ghost"
            >
              <TextAlignJustify aria-hidden="true" />
            </Button>
          )}
          <h1 className="text-3xl">One chat to rule them all</h1>
          <input
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) uploadManager.enqueueUploads(files, "chat");
              event.target.value = "";
            }}
            type="file"
          />
          {(attachments.length > 0 || uploadManager.uploadTasks.length > 0) && (
            <div className="flex w-full flex-wrap gap-2">
              {attachments.map((attachment) => (
                <PreviewAttachment
                  attachment={attachment}
                  key={attachment.url}
                  onRemove={() => {
                    const task = uploadManager.uploadTasks.find(
                      (item) => item.url === attachment.url,
                    );
                    if (task) uploadManager.removeUploadTask(task.id);
                    setAttachments((current) =>
                      current.filter((item) => item.url !== attachment.url),
                    );
                  }}
                />
              ))}
              {uploadManager.uploadTasks
                .filter((item) =>
                  ["queued", "preparing", "uploading", "error"].includes(
                    item.status,
                  ),
                )
                .map((item) => (
                  <PreviewAttachment
                    attachment={{
                      url: "",
                      name: item.file.name,
                      contentType: item.file.type,
                    }}
                    error={item.error}
                    isUploading={
                      item.status === "queued" ||
                      item.status === "preparing" ||
                      item.status === "uploading"
                    }
                    key={item.id}
                    onRemove={() => uploadManager.removeUploadTask(item.id)}
                    onRetry={
                      item.status === "error"
                        ? () => uploadManager.retryUploadTask(item.id)
                        : undefined
                    }
                  />
                ))}
            </div>
          )}
          {voiceRecorder.isRecording ? (
            <VoiceRecordingIndicator
              elapsedSeconds={voiceRecorder.elapsedSeconds}
              interimTranscript={voiceRecorder.interimTranscript}
              onCancel={voiceRecorder.cancel}
              onStop={voiceRecorder.stop}
              transcript={voiceRecorder.transcript}
            />
          ) : (
            <CustomInputGroup className="h-14 w-full rounded-full! bg-sidebar!">
              {/* TODO multiline + combine with CHAT SDK's main input */}
              <CustomInputGroupInput
                placeholder=" Your first message (optional)"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <InputGroupAddon align="inline-start" className="ml-0!">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InputGroupButton
                      aria-label="Add files"
                      size="icon-md"
                      variant="ghost-sidebar"
                      className="rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip />
                    </InputGroupButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add files</p>
                  </TooltipContent>
                </Tooltip>
              </InputGroupAddon>

              <InputGroupAddon align="inline-end" className="mr-0!">
                {isMobile ? (
                  <Sheet>
                    <SheetTrigger asChild>{agentSelectionButton}</SheetTrigger>
                    <SheetContent
                      side="right"
                      className="w-80 border-teal-50/15 bg-sidebar p-0"
                    >
                      <SheetHeader className="sr-only">
                        <SheetTitle>Select AI Agents</SheetTitle>
                        <SheetDescription>
                          Choose who will help with your request
                        </SheetDescription>
                      </SheetHeader>
                      {agentPanel}
                    </SheetContent>
                  </Sheet>
                ) : (
                  agentSelectionButton
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InputGroupButton
                      aria-label="Dictate"
                      size="icon-md"
                      variant="ghost-sidebar"
                      className={cn(
                        "rounded-full",
                        voiceRecorder.isRecording && "text-red-500",
                      )}
                      onClick={() => {
                        if (voiceRecorder.isRecording) {
                          voiceRecorder.stop();
                        } else {
                          void voiceRecorder.start().catch(() => undefined);
                        }
                      }}
                    >
                      {voiceRecorder.isRecording ? <Square /> : <Mic />}
                    </InputGroupButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {voiceRecorder.isRecording
                        ? "Stop recording"
                        : "Record voice"}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <InputGroupButton
                  aria-label="Submit"
                  size="icon-md"
                  variant="primary"
                  className="rounded-full"
                  onClick={handleSubmit}
                  disabled={
                    status === "submitted" ||
                    status === "streaming" ||
                    voiceRecorder.isStarting ||
                    isReadingAttachments ||
                    voiceRecorder.isRecording ||
                    uploadManager.hasUploadErrors ||
                    uploadManager.uploadTasks.some((task) =>
                      ["queued", "preparing", "uploading"].includes(
                        task.status,
                      ),
                    )
                  }
                >
                  <ArrowUp />
                </InputGroupButton>
              </InputGroupAddon>
            </CustomInputGroup>
          )}
        </article>

        {/* Desktop: persistent side panel — uses same AgentSelectionContext */}
        {!isMobile && (
          <div className="relative hidden w-xs shrink-0 md:block">
            <div className="pointer-events-none absolute inset-y-0 end-full w-4 bg-linear-to-l from-background/50 to-transparent" />
            {agentPanel}
          </div>
        )}

        <DataStreamHandler />
      </div>
    </AgentSelectionContext.Provider>
  );
}

const AGENT_SELECTION_LIMIT = 3;

function SelectAgents() {
  const { redirect } = useRouteFlowViewContext();
  const { selectedAgentIds, setSelectedAgentIds } = useContext(
    AgentSelectionContext,
  );
  const { data } = useSWR<Agent[]>("/api/agent");

  useEffect(() => {
    if (!data) return;

    const validAgentIds = new Set(data.map((agent) => agent.id));
    setSelectedAgentIds((current) => {
      const next = current.filter((agentId) => validAgentIds.has(agentId));
      return next.length === current.length ? current : next;
    });
  }, [data, setSelectedAgentIds]);

  return (
    <RouteViewLayout className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-teal-50/15 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Select AI Agents</h2>
          <p className="text-xs text-foreground/75">
            Choose who will help with your request
          </p>
        </div>

        <Tooltip disableHoverableContent>
          <TooltipTrigger asChild>
            <Button
              onClick={() => redirect({ id: "agent-form" })}
              variant="primary"
              size="icon"
              rounded="full"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            collisionPadding={8}
            className="*:pointer-events-none" // TODO create CustomTooltipContent
          >
            <p>New Agent</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <AnimatedList asChild>
        <CustomScrollArea className="min-h-0 flex-1 overflow-auto">
          {!data && (
            // TODO skeleton
            <PageSpinner />
          )}
          {data?.map((agent) => (
            <AnimatedItem key={agent.id} asChild>
              <SelectableAgent
                agent={agent}
                selectedAgentIds={selectedAgentIds}
                setSelectedAgentIds={setSelectedAgentIds}
              />
            </AnimatedItem>
          ))}
        </CustomScrollArea>
      </AnimatedList>
    </RouteViewLayout>
  );
}

interface SelectableAgentProps {
  agent: Agent;
  selectedAgentIds: string[];
  setSelectedAgentIds: Dispatch<SetStateAction<string[]>>;
}

const SelectableAgent = forwardRef<HTMLButtonElement, SelectableAgentProps>(
  function SelectableAgent(
    { agent, selectedAgentIds, setSelectedAgentIds },
    ref,
  ) {
    const { redirect } = useRouteFlowViewContext();

    const innerAgentRef = useRef<HTMLButtonElement>(null);
    const agentRef = useMergedRefs(ref, innerAgentRef);
    const animationLockRef = useRef(false);

    const [isTooltipOpen, setIsTooltipOpen] = useState(false); // TODO close after some time

    const isSelected = useMemo(
      () => selectedAgentIds.includes(agent.id),
      [selectedAgentIds, agent.id],
    );

    const handleSelect = useCallback(() => {
      const nextIsSelected = !isSelected;
      if (nextIsSelected) {
        if (selectedAgentIds.length >= AGENT_SELECTION_LIMIT) {
          const agentElement = agentRef.current;
          if (animationLockRef.current === false && agentElement) {
            animationLockRef.current = true;
            agentElement.classList.add("animate-error");
            setIsTooltipOpen(true);
            // TODO cleanup
            setTimeout(() => {
              animationLockRef.current = false;
              agentElement.classList.remove("animate-error");
            }, 500);
          }
        } else
          setSelectedAgentIds((ids) =>
            ids.includes(agent.id) ? ids : [...ids, agent.id],
          );
      } else setSelectedAgentIds((ids) => ids.filter((id) => id !== agent.id));
    }, [isSelected, selectedAgentIds.length, agent.id]);

    return (
      <>
        <ContextMenu>
          <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
            <ContextMenuTrigger asChild>
              <TooltipTrigger asChild>
                <Ripple
                  ref={agentRef}
                  onClick={handleSelect}
                  data-active={isSelected}
                  className="group/agent relative flex h-14 w-full items-center gap-3 bg-sidebar px-3 py-2 transition-colors active:bg-teal-50/5! data-[active=true]:bg-teal-50/5"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50/15">
                    {agent.avatarUrl && (
                      <EnhancedImage
                        src={agent.avatarUrl}
                        alt={agent.name}
                        width={48}
                        height={48}
                        className="size-full object-cover"
                      />
                    )}
                    {!agent.avatarUrl && <Bot className="size-5" />}
                  </span>

                  <span
                    className={cn(
                      "absolute start-11 top-10 flex size-5 scale-0 items-center justify-center rounded-full border-3 border-sidebar bg-green-600 opacity-0 transition-all",
                      isSelected && "scale-100 border-[#303131] opacity-100",
                    )}
                  >
                    <Check className="size-3" />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-start">
                    <span className="truncate text-sm font-medium">
                      {agent.name}
                    </span>
                    <span className="truncate text-xs text-foreground/75">
                      {agent.description || "Isn't described"}
                    </span>
                  </span>
                  <span className="flex max-w-28 shrink-0 flex-col items-end gap-1">
                    <span className="max-w-full truncate rounded-full bg-teal-50/15 px-1 text-[0.625rem] text-foreground/75">
                      {agent.model}
                    </span>
                  </span>
                </Ripple>
              </TooltipTrigger>
            </ContextMenuTrigger>

            <CustomContextMenuContent>
              <CustomContextMenuItem
                onClick={() => redirect({ id: "agent-form", context: [agent] })}
              >
                <Pencil /> Edit / View
              </CustomContextMenuItem>
              <CustomContextMenuItem
                onClick={() =>
                  redirect({ id: "remove-agent", context: [agent] })
                }
              >
                <Trash2 /> Remove
              </CustomContextMenuItem>
            </CustomContextMenuContent>

            <TooltipContent
              side="left"
              className="flex items-center gap-2 p-2 pe-4"
              collisionPadding={8}
            >
              <Ripple asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  rounded="full"
                  className="relative animate-ping-with-shadow shadow-background/50 fill-mode-forwards repeat-1 [animation-delay:500ms]"
                >
                  <CircleFadingArrowUp />
                </Button>
              </Ripple>
              <div className="flex flex-col gap-1">
                <h3 className="text-start font-medium">
                  Upgrade to Select More Agents
                </h3>
                <p className="text-start text-background/75">
                  Go to the plans page to upgrade
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </ContextMenu>

        <div className="h-0 border-b border-teal-50/15 last:hidden" />
      </>
    );
  },
);
SelectableAgent.displayName = "SelectableAgent";

type NewAgentRequest = z.input<typeof createAgentBodySchema>;
type EditAgentRequest = z.input<typeof updateAgentBodySchema>;
type AgentRequest = NewAgentRequest | EditAgentRequest;

function readAgentField(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value !== "object") return undefined;
  const candidate = value as { target?: unknown; value?: unknown };
  if (candidate.target && typeof candidate.target === "object") {
    return readAgentField((candidate.target as { value?: unknown }).value);
  }
  if ("value" in candidate && candidate.value !== value) {
    return readAgentField(candidate.value);
  }
  return undefined;
}

function readAgentString(value: unknown, fallback = "") {
  const normalized = readAgentField(value);
  return typeof normalized === "string" ? normalized : fallback;
}

function readAgentNumber(value: unknown, fallback: number) {
  const normalized = readAgentField(value);
  if (typeof normalized === "number" && Number.isFinite(normalized)) {
    return normalized;
  }
  if (typeof normalized === "string" && normalized.trim()) {
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toSerializableAgentPayload(
  payload: AgentRequest,
  fallback?: {
    id?: string;
    name?: string;
    description?: string | null;
    instructions?: string;
    model?: string;
    temperature?: number | null;
    avatarUrl?: string | null;
  },
): AgentRequest {
  const normalized: Record<string, unknown> = {
    name: readAgentString(payload.name, fallback?.name ?? ""),
    description: readAgentString(
      payload.description,
      fallback?.description ?? "",
    ),
    instructions: readAgentString(
      payload.instructions,
      fallback?.instructions ?? "",
    ),
    providerId: readAgentString(payload.providerId, "openrouter"),
    model: readAgentString(payload.model, fallback?.model ?? defaultModel),
    temperature: readAgentNumber(
      payload.temperature,
      fallback?.temperature ?? 70,
    ),
  };

  const avatarUrl = readAgentString(
    payload.avatarUrl,
    fallback?.avatarUrl ?? "",
  );
  if (avatarUrl) normalized.avatarUrl = avatarUrl;

  const id = readAgentString(payload.id, fallback?.id ?? "");
  if (id) normalized.id = id;

  return normalized as AgentRequest;
}

function AgentForm() {
  const { redirect, currentRoute } = useRouteFlowViewContext();

  // TODO when closing the route, the context is reset immediately (it should be debounced)
  const isNewAgent = useMemo(
    () => !currentRoute.context,
    [currentRoute.context],
  );

  const currentAgent = useMemo(() => {
    const agent = currentRoute.context?.[0] as Agent | undefined;
    if (!agent) return undefined;
    return deepReplace(agent, null, undefined, { depthLimit: 1 });
  }, [currentRoute.context]);

  const defaultValues = useMemo(
    () => ({
      model: defaultModel,
      temperature: 70,
    }),
    [],
  );

  const formId = useId(); // TODO could make a hook to gather CustomForm component's stuff

  const addForm = useForm<NewAgentRequest>({
    resolver: zodResolver(createAgentBodySchema),
    defaultValues,
  });

  const editForm = useForm<EditAgentRequest>({
    resolver: zodResolver(updateAgentBodySchema),
    defaultValues,
  });

  const { trigger: newAgent } = useSWRMutation<any, any, Key, NewAgentRequest>(
    "/api/agent",
    getFetcher("POST"),
  );

  const { trigger: editAgent } = useSWRMutation<
    any,
    any,
    Key,
    EditAgentRequest
  >("/api/agent", getFetcher("PATCH"));

  const submitNewAgent = useCallback(
    async (payload: NewAgentRequest) => {
      const result = await newAgent(
        toSerializableAgentPayload(payload) as NewAgentRequest,
      );
      await globalMutate("/api/agent");
      return result;
    },
    [newAgent],
  );
  const submitEditAgent = useCallback(
    async (payload: EditAgentRequest) => {
      const normalizedPayload = toSerializableAgentPayload(
        payload,
        currentAgent,
      ) as EditAgentRequest;
      const result = await editAgent(normalizedPayload);
      await globalMutate("/api/agent");
      return result;
    },
    [currentAgent, editAgent],
  );

  useEffect(() => {
    if (currentAgent) editForm.reset(currentAgent);
  }, [currentAgent, editForm]);

  const goBack = useCallback(() => {
    redirect({ id: "select-agents" });
    addForm.reset();
    editForm.reset();
    // TODO implement a tooltip that says "you have unsaved changes" when isDirty, here
    // it also has a "remember my choice" checkbox
    // make it a component that wraps a button
  }, [redirect, addForm, editForm]);

  return (
    <RouteViewLayout>
      {isNewAgent ? (
        <CustomForm
          key="new-agent"
          id={formId}
          form={addForm}
          swr={{ trigger: submitNewAgent }}
          onSubmit={goBack}
          className="flex h-full flex-col"
        >
          <AgentFormContent
            isNewAgent={isNewAgent}
            formId={formId}
            goBack={goBack}
          />
        </CustomForm>
      ) : (
        <CustomForm
          key="edit-agent"
          id={formId}
          form={editForm}
          swr={{ trigger: submitEditAgent }}
          onSubmit={goBack}
          className="flex h-full flex-col"
        >
          <AgentFormContent
            isNewAgent={isNewAgent}
            formId={formId}
            goBack={goBack}
          />
        </CustomForm>
      )}
    </RouteViewLayout>
  );
}

interface AgentFormContentProps {
  isNewAgent: boolean;
  formId: string;
  goBack: () => void;
}

function AgentFormContent({
  isNewAgent,
  formId,
  goBack,
}: AgentFormContentProps) {
  const { control, setValue } = useFormContext<AgentRequest>();
  const providerId = useWatch({ control, name: "providerId" }) ?? "openrouter";
  const modelId = useWatch({ control, name: "model" });
  const { data: providerData } = useSWR<{
    providers: Array<{ id: string; name: string }>;
    credentials: Array<{ providerId: string }>;
  }>("/api/ai-providers", { shouldRetryOnError: false });
  const { data: modelCatalog } = useSWR<{
    models: Array<{ id: string; name: string }>;
  }>(
    `/api/models?providerId=${encodeURIComponent(providerId)}&toolsOnly=true`,
    {
      shouldRetryOnError: false,
      onError: () => undefined,
    },
  );
  const modelOptions = useMemo(
    () =>
      (
        modelCatalog?.models ?? [
          {
            id:
              defaultModelForProvider(providerId),
            name:
              providerId === "openrouter"
                ? "OpenRouter Free Router"
                : defaultModelForProvider(providerId),
          },
        ]
      ).map((model) => ({
        value: model.id,
        label:
          model.name === model.id ? model.id : `${model.name} (${model.id})`,
        type: "single" as const,
      })),
    [modelCatalog, providerId],
  );

  useEffect(() => {
    if (!modelId || !modelOptions.some((option) => option.value === modelId)) {
      const firstOption = modelOptions[0];
      if (firstOption)
        setValue("model", firstOption.value, { shouldDirty: false });
    }
  }, [modelId, modelOptions, setValue]);

  const availableProviders = useMemo(() => {
    const connected = new Set(
      providerData?.credentials.map((item) => item.providerId),
    );
    return (providerData?.providers ?? []).filter(
      (provider) => provider.id === "openrouter" || connected.has(provider.id),
    );
  }, [providerData]);

  return (
    <>
      <RouteViewHeader
        title={isNewAgent ? "New Agent" : "Edit Agent"}
        onBack={goBack}
      >
        {/* TODO move this to the end of the form */}
        <Submit variant="primary" form={formId} rounded="full">
          {isNewAgent ? "Add" : "Save"}
        </Submit>
      </RouteViewHeader>
      <CustomScrollArea className="h-full overflow-auto">
        <FieldGroup className="my-7">
          <ControlledInput
            name={"avatarUrl" satisfies Path<AgentRequest>}
            className="mx-auto"
            inputStyle="unstyled"
            inputComponent={FileInput}
            inputProps={{
              useUploadTaskManagerProps: {
                defaultStorageContext: "profile-pictures",
              },
            }}
          />
          <ControlledInput
            name={"name" satisfies Path<AgentRequest>}
            className="mx-4 w-auto"
            inputComponent={CustomInputGroupInput}
            inputProps={{ placeholder: "Steve Jobs, Elon Musk, etc" }}
          />
          <ControlledInput
            name={"description" satisfies Path<AgentRequest>}
            className="mx-4 w-auto"
            inputComponent={CustomInputGroupInput}
            inputProps={{ placeholder: "Made in Circulo, etc" }}
          />
          <ControlledInput
            name={"instructions" satisfies Path<AgentRequest>}
            className="mx-4 w-auto"
            inputComponent={InputGroupTextarea}
            inputProps={{ placeholder: "Be friendly, Be harsh, etc" }}
          />
          <ControlledInput
            name={"providerId" satisfies Path<AgentRequest>}
            description="Use your connected key, or Circulo's default provider"
            className="mx-4 w-auto"
            errorPosition="before-input"
            orientation="horizontal"
            inputStyle="no-input-group"
            inputComponent={SelectInput}
            inputProps={{
              options: [
                {
                  value: "openrouter",
                  label: "OpenRouter",
                  type: "single" as const,
                },
                ...availableProviders
                  .filter((provider) => provider.id !== "openrouter")
                  .map((provider) => ({
                    value: provider.id,
                    label: provider.name,
                    type: "single" as const,
                  })),
              ],
            }}
          />
          <ControlledInput
            name={"model" satisfies Path<AgentRequest>}
            description="Models are loaded from the selected provider"
            className="mx-4 w-auto"
            errorPosition="before-input"
            orientation="horizontal"
            inputStyle="no-input-group"
            inputComponent={SelectInput} // TODO replace with combobox
            inputProps={{
              options: modelOptions,
            }}
          />
          <ControlledInput
            name={"temperature" satisfies Path<AgentRequest>}
            description="How creative?"
            className="mx-4 w-auto"
            errorPosition="before-input"
            inputStyle="no-input-group"
            inputComponent={SliderInput}
            inputProps={{ min: 1, max: 100 }} // TODO min should be zero, but it doesn't work well that way
          />
        </FieldGroup>
      </CustomScrollArea>
    </>
  );
}

const deleteAgentSchema = deleteAgentParamsSchema.extend(
  deleteAgentQuerySchema.shape,
);

type RemoveAgentRequest = z.input<typeof deleteAgentSchema>;

// TODO implement a "remember my choice" checkbox
function RemoveAgent() {
  const { redirect, currentRoute } = useRouteFlowViewContext();

  const currentAgent = useMemo(
    () => currentRoute.context?.[0] as Agent | undefined,
    [currentRoute.context],
  );

  const form = useForm({
    resolver: zodResolver(deleteAgentSchema),
    defaultValues: { id: currentAgent?.id, hard: false },
  });

  useEffect(() => {
    if (currentAgent) form.reset({ id: currentAgent.id, hard: false });
  }, [currentAgent, form]);

  const deleteFetcher = useMemo(() => getFetcher("DELETE"), []);

  const { trigger } = useSWRMutation<
    Agent,
    ApiRequestError,
    Key,
    RemoveAgentRequest
  >("/api/agent", (url: string, { arg }: { arg: RemoveAgentRequest }) =>
    deleteFetcher<Agent>([`${url}/${arg.id}`, { hard: arg.hard }]),
  );

  const goBack = useCallback(
    () => redirect({ id: "select-agents" }),
    [redirect],
  );

  return (
    <RouteViewLayout>
      <RouteViewHeader title="Remove Agent" onBack={goBack} />
      <CustomForm
        form={form}
        swr={{ trigger }}
        onSubmit={goBack}
        className="my-7 flex flex-col gap-7"
      >
        <Alert className="mx-4 w-auto">
          <TriangleAlert />
          <AlertTitle>Are you sure?</AlertTitle>
          <AlertDescription>
            <p>You are about to remove the following agent:</p>
          </AlertDescription>
        </Alert>
        <Table>
          <TableBody>
            <TableRow className="border-teal-50/15">
              <TableCell className="ps-4 text-teal-50/75">Name</TableCell>
              <TableCell className="pe-4 font-medium">
                {currentAgent?.name}
              </TableCell>
            </TableRow>
            <TableRow className="border-teal-50/15">
              <TableCell className="ps-4 text-teal-50/75">
                Description
              </TableCell>
              <TableCell className="pe-4 font-medium">
                {currentAgent?.description || "Isn't described"}
              </TableCell>
            </TableRow>
            <TableRow className="border-teal-50/15">
              <TableCell className="ps-4 text-teal-50/75">
                Instructions
              </TableCell>
              <TableCell className="pe-4 font-medium">
                {currentAgent?.instructions}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="flex items-center justify-end gap-4 px-4">
          <Button variant="ghost-sidebar" rounded="full" onClick={goBack}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" rounded="full">
            Remove
          </Button>
        </div>
      </CustomForm>
    </RouteViewLayout>
  );
}

function RouteViewLayout({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  const { isCurrentRoute, isBehindCurrent } = useRouteFlowViewContext();

  return (
    <div
      className={cn(
        "absolute start-full -end-full size-full bg-sidebar transition-all",
        isCurrentRoute && "start-0 end-0",
        isBehindCurrent && "-start-1/8 end-1/8",
        className,
      )}
      {...props}
    >
      {children}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-background/50 opacity-0 transition-opacity",
          isBehindCurrent && "opacity-100",
        )}
      />
    </div>
  );
}

// TODO maybe add forms wherever there are inputs
