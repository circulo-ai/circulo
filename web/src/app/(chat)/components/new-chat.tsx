"use client";

import { createBodySchema } from "@/app/api/agent/schema";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { PageSpinner } from "@/components/page-spinner";
import {
  CustomContextMenuContent,
  CustomContextMenuItem,
} from "@/components/ui-custom/context-menu";
import { ControlledInput } from "@/components/ui-custom/controlled-input";
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
import { Submit } from "@/components/ui-custom/submit";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Agent } from "@/db";
import { getFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUp,
  Bot,
  Check,
  CircleFadingArrowUp,
  Eye,
  Mic,
  Paperclip,
  Pencil,
  Plus,
} from "lucide-react";
import Image from "next/image";
import {
  ComponentProps,
  Dispatch,
  SetStateAction,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import useSWR, { Key } from "swr";
import useSWRMutation from "swr/mutation";
import z from "zod";

const route: Route = {
  id: "select-agents",
  view: SelectAgents,
  children: [{ id: "new-agent", view: NewAgent }],
};

interface NewChatProps {
  id: string;
}

export function NewChat({ id }: NewChatProps) {
  const { trigger } = useSWRMutation("/api/chat", getFetcher("POST"));

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
              onClick={() => trigger()} // TODO use useChat
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
              onClick={() => redirect("new-agent")}
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
  const agentRef = useRef<HTMLButtonElement>(null);
  const animationLockRef = useRef(false);

  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

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
      } else setSelectedAgentIds((ids) => [...ids, agent.id]);
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
                disabled={false}
                onClick={handleSelect}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 transition-colors",
                  isSelected && "bg-teal-50/5",
                )}
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-teal-50/15">
                  {agent.avatarUrl && (
                    <Image src={agent.avatarUrl} alt={agent.name} />
                  )}
                  {!agent.avatarUrl && <Bot />}
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
                    {agent.description ?? "Isn't described"}
                  </div>
                </div>

                <div className="ms-auto truncate overflow-hidden rounded-full bg-teal-50/15 px-1 text-[0.625rem]">
                  {agent.model}
                </div>
              </Ripple>
            </TooltipTrigger>
          </ContextMenuTrigger>

          <CustomContextMenuContent>
            <CustomContextMenuItem>
              <Eye /> View
            </CustomContextMenuItem>
            <CustomContextMenuItem>
              <Pencil /> Edit
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

type NewAgentRequest = z.input<typeof createBodySchema>;

function NewAgent() {
  const { redirect } = useRouteFlowViewContext();

  const formId = useId();

  const { trigger } = useSWRMutation<any, any, Key, NewAgentRequest>(
    "/api/agent",
    getFetcher("POST"),
  );

  const form = useForm<NewAgentRequest>({
    resolver: zodResolver(createBodySchema),
    defaultValues: {
      name: "",
      instructions: "",
    },
  });

  const goBack = useCallback(() => {
    redirect("select-agents");
    form.reset();
  }, [redirect, form]);

  return (
    <RouteViewLayout>
      <CustomForm<NewAgentRequest>
        id={formId}
        swr={{ trigger }}
        form={form}
        onSubmit={goBack}
        className="flex h-full flex-col"
      >
        <RouteViewHeader title="New Agent" onBack={goBack}>
          <Submit variant="primary" form={formId} rounded="full">
            Add
          </Submit>
        </RouteViewHeader>
        <CustomScrollArea className="overflow-auto">
          <FieldGroup className="mt-7">
            <ControlledInput<NewAgentRequest>
              inputComponent={CustomInputGroupInput}
              name="name"
              inputProps={{ placeholder: "Steve Jobs, Elon Musk, etc" }}
              className="mx-4 w-auto"
            />
            <ControlledInput<NewAgentRequest>
              inputComponent={CustomInputGroupInput}
              name="description"
              inputProps={{ placeholder: "Optional" }}
              className="mx-4 w-auto"
            />
            <ControlledInput<NewAgentRequest>
              inputComponent={InputGroupTextarea}
              name="instructions"
              inputProps={{ placeholder: "Be friendly, Be harsh, etc" }}
              className="mx-4 w-auto"
            />
          </FieldGroup>
        </CustomScrollArea>
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
