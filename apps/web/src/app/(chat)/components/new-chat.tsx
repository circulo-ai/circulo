"use client";

import { DataStreamHandler } from "@/components/data-stream-handler";
import { PageSpinner } from "@/components/page-spinner";
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
import { AnimatedList } from "@/components/ui/animated-list";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileInput } from "@/components/uploads/file-input";
import { deepReplace } from "@/lib/deep-replace";
import { getFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { useChat } from "@ai-sdk/react";
import { Agent } from "@circulo-ai/db";
import {
  createAgentBodySchema,
  defaultModel,
  deleteAgentQuerySchema,
  updateAgentBodySchema,
} from "@circulo-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUp,
  Bot,
  Check,
  CircleFadingArrowUp,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  ComponentProps,
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Path, useForm } from "react-hook-form";
import useSWR, { Key } from "swr";
import useSWRMutation from "swr/mutation";
import z from "zod";

const route: Route = {
  id: "select-agents",
  view: SelectAgents,
  children: [
    { id: "agent-form", view: AgentForm },
    { id: "remove-agent", view: RemoveAgent },
  ],
};

interface NewChatProps {
  id: string;
}

export function NewChat({ id }: NewChatProps) {
  const { sendMessage } = useChat({ id });

  const { isChatLoading } = useChatHistoryStore();

  if (isChatLoading) return <PageSpinner />; // TODO replace with skeleton

  return (
    <div className="flex h-full">
      <article className="mx-auto flex h-full max-w-3xl grow flex-col items-center justify-center gap-8 p-8">
        <h1 className="text-3xl">This text will be replaced</h1>
        <CustomInputGroup className="h-14 rounded-full! bg-sidebar!">
          {/* TODO multiline + combine with CHAT SDK's main input */}
          <CustomInputGroupInput placeholder=" Your first message (optional)" />
          <InputGroupAddon align="inline-start" className="ml-0!">
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  aria-label="Add files"
                  size="icon-md"
                  variant="ghost-sidebar" // TODO change the variant's name so it's more generic
                  className="rounded-full"
                >
                  <Paperclip />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>Soon...</p>
              </TooltipContent>
            </Tooltip>
          </InputGroupAddon>

          <InputGroupAddon align="inline-end" className="mr-0!">
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  aria-label="Dictate"
                  size="icon-md"
                  variant="ghost-sidebar"
                  className="rounded-full"
                >
                  <Mic />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>Soon...</p>
              </TooltipContent>
            </Tooltip>
            <InputGroupButton
              aria-label="Submit"
              size="icon-md"
              variant="primary"
              className="rounded-full"
              onClick={() =>
                sendMessage({
                  role: "user",
                  parts: [{ type: "text", text: "Hello World!" }],
                })
              }
            >
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </CustomInputGroup>
      </article>
      <div className="relative w-xs">
        <div className="pointer-events-none absolute inset-y-0 end-full w-4 bg-linear-to-l from-background/50 to-transparent" />
        <div className="relative h-full overflow-hidden bg-sidebar">
          <RouteFlowController route={route} />
        </div>
      </div>
      <DataStreamHandler />
    </div>
  );
}

const AGENT_SELECTION_LIMIT = 3;

function SelectAgents() {
  const { redirect } = useRouteFlowViewContext();

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const { data } = useSWR<Agent[]>("/api/agent");

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

      <CustomScrollArea className="overflow-auto *:*:block!">
        {!data && (
          // TODO skeleton
          <PageSpinner />
        )}
        {data && (
          // TODO needs better performance when too many agents
          <AnimatedList
            itemElement="div"
            ids={data.map((agent) => agent.id)}
            renderItem={(id) => {
              // TODO optimize performance
              const agent = data.find((agent) => agent.id === id);
              if (!agent) return;
              return (
                <SelectableAgent
                  key={id}
                  agent={agent}
                  selectedAgentIds={selectedAgentIds}
                  setSelectedAgentIds={setSelectedAgentIds}
                />
              );
            }}
          />
        )}
      </CustomScrollArea>
    </RouteViewLayout>
  );
}

interface SelectableAgentProps {
  agent: Agent;
  selectedAgentIds: string[];
  setSelectedAgentIds: Dispatch<SetStateAction<string[]>>;
}

function SelectableAgent({
  agent,
  selectedAgentIds,
  setSelectedAgentIds,
}: SelectableAgentProps) {
  const { redirect } = useRouteFlowViewContext();

  const agentRef = useRef<HTMLButtonElement>(null);
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
        const agentElement = agentRef.current as HTMLButtonElement | null;
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
        <Tooltip open={isTooltipOpen}>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Ripple
                ref={agentRef}
                onClick={handleSelect}
                data-active={isSelected}
                className="flex w-full items-center gap-2 px-3 py-2 transition-colors active:bg-teal-50/5 data-[active=true]:bg-teal-50/5"
              >
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50/15">
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
                </div>

                <div
                  className={cn(
                    "absolute start-11 top-10 flex size-5 scale-0 items-center justify-center rounded-full border-3 border-sidebar bg-green-600 opacity-0 transition-all",
                    isSelected && "scale-100 border-[#303131] opacity-100",
                  )}
                >
                  <Check className="size-3" />
                </div>

                <div className="flex flex-col items-start gap-1 overflow-hidden">
                  <div className="w-full truncate text-start text-sm font-medium">
                    {agent.name}
                  </div>
                  <div className="w-full truncate text-start text-xs text-foreground/75">
                    {agent.description || "Isn't described"}
                  </div>
                </div>

                <div className="ms-auto truncate overflow-hidden rounded-full bg-teal-50/15 px-1 text-[0.625rem]">
                  {agent.model}
                </div>
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
              onClick={() => redirect({ id: "remove-agent", context: [agent] })}
            >
              <Trash2 /> Remove
            </CustomContextMenuItem>
            <ContextMenuSeparator />
            <CustomContextMenuItem disabled inset>
              More features soon...
            </CustomContextMenuItem>
          </CustomContextMenuContent>

          <TooltipContent
            side="left"
            className="flex items-center gap-2 p-2 pe-4"
            onPointerDownOutside={() => setIsTooltipOpen(false)}
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

      <div className="h-0 border-b border-teal-50/15" />
    </>
  );
}

type NewAgentRequest = z.input<typeof createAgentBodySchema>;
type EditAgentRequest = z.input<typeof updateAgentBodySchema>;
type AgentRequest = NewAgentRequest | EditAgentRequest;

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
          swr={{ trigger: newAgent }}
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
          swr={{ trigger: editAgent }}
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
            name={"model" satisfies Path<AgentRequest>}
            description="More models coming soon"
            className="mx-4 w-auto"
            errorPosition="before-input"
            orientation="horizontal"
            inputStyle="no-input-group"
            inputComponent={SelectInput} // TODO replace with combobox
            inputProps={{
              // TODO get from endpoint
              options: [
                {
                  type: "group",
                  label: "OpenAI",
                  options: [
                    { value: "gpt-4.1", label: "GPT-4.1", type: "single" },
                    {
                      value: "gpt-4.1-mini",
                      label: "GPT-4.1 Mini",
                      type: "single",
                    },
                    {
                      value: "gpt-4.1-nano",
                      label: "GPT-4.1 Nano",
                      type: "single",
                    },
                  ],
                },
                { type: "separator" },
                {
                  type: "group",
                  label: "Anthropic",
                  options: [
                    {
                      value: "claude-opus-4-5",
                      label: "Claude Opus 4.5",
                      type: "single",
                    },
                    {
                      value: "claude-sonnet-4-5",
                      label: "Claude Sonnet 4.5",
                      type: "single",
                    },
                    {
                      value: "claude-haiku-4-5",
                      label: "Claude Haiku 4.5",
                      type: "single",
                    },
                  ],
                },
                { type: "separator" },
                {
                  type: "group",
                  label: "Google (Gemini)",
                  options: [
                    {
                      value: "gemini-3-pro",
                      label: "Gemini 3 Pro",
                      type: "single",
                    },
                    {
                      value: "gemini-2.5-pro",
                      label: "Gemini 2.5 Pro",
                      type: "single",
                    },
                    {
                      value: "gemini-2.5-flash",
                      label: "Gemini 2.5 Flash",
                      type: "single",
                    },
                  ],
                },
              ],
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

type RemoveAgentRequest = z.input<typeof deleteAgentQuerySchema>;

// TODO implement a "remember my choice" checkbox
function RemoveAgent() {
  const { redirect, currentRoute } = useRouteFlowViewContext();

  const currentAgent = useMemo(
    () => currentRoute.context?.[0] as Agent | undefined,
    [currentRoute.context],
  );

  const form = useForm({
    resolver: zodResolver(deleteAgentQuerySchema),
    defaultValues: { id: currentAgent?.id },
  });

  useEffect(() => {
    if (currentAgent) form.reset({ id: currentAgent.id });
  }, [currentAgent, form]);

  const { trigger } = useSWRMutation<any, any, Key, RemoveAgentRequest>(
    "/api/agent",
    getFetcher("DELETE"),
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
