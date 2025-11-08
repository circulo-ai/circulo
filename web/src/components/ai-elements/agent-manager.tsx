"use client";

import { useChatAgents } from "@/hooks/use-chat-agents";
import { useAgentList } from "@/hooks/use-agent-mutations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type DraggableProvided, type DroppableProvided, type DropResult, DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const addAgentSchema = z.object({
  agentId: z.string().min(1, "Please select an agent"),
  customSystemPrompt: z.string().nullable().optional(),
  customTemperature: z.number().min(0).max(2).nullable().optional(),
});

type AddAgentFormData = z.infer<typeof addAgentSchema>;

export function AgentManager() {
  const [open, setOpen] = useState(false);
  const { agents, isLoading: isLoadingChatAgents } = useChatAgents();
  const { agents: availableAgents, isLoading: isLoadingAgentList } = useAgentList();
  const { addAgent, updateAgent, reorderAgents, removeAgent } = useChatAgents();

  const form = useForm<AddAgentFormData>({
    resolver: zodResolver(addAgentSchema),
    defaultValues: {
      agentId: "",
      customSystemPrompt: null,
      customTemperature: null,
    },
  });

  const onSubmit = async (data: AddAgentFormData) => {
    try {
      await addAgent(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Failed to add agent:", error);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    if (sourceIndex === destIndex) return;

    const orderedAgents = Array.from(agents);
    const [movedAgent] = orderedAgents.splice(sourceIndex, 1);
    orderedAgents.splice(destIndex, 0, movedAgent);

    // Build updates array and send a single PATCH to apply the new order atomically
    const updates = orderedAgents.map((a, i) => ({ agentId: a.id, speakOrder: i }));
    try {
      await reorderAgents(updates);
    } catch (err) {
      console.error("Failed to reorder agents:", err);
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    try {
      await removeAgent(agentId);
    } catch (error) {
      console.error("Failed to remove agent:", error);
    }
  };

  const unusedAgents = availableAgents.filter(
    (a) => !agents.find((ca) => ca.id === a.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Chat Agents</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              disabled={isLoadingAgentList || unusedAgents.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Agent to Chat</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="agentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an agent" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <ScrollArea className="max-h-[200px]">
                            {unusedAgents.map((agent) => (
                              <SelectItem
                                key={agent.id}
                                value={agent.id}
                                className="flex items-center gap-2"
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color || '#3B82F6' }} />
                                {agent.name}
                              </SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customTemperature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Temperature (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          placeholder="Default temperature"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const value = e.target.value === "" ? null : parseFloat(e.target.value);
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customSystemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom System Prompt (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Default system prompt"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const value = e.target.value === "" ? null : e.target.value;
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Add to Chat
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoadingChatAgents && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      )}

      {!isLoadingChatAgents && agents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No agents are currently part of this chat.
        </div>
      )}

      {!isLoadingChatAgents && agents.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="agents">
            {(provided: DroppableProvided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {agents.map((agent, index) => (
                  <Draggable
                    key={agent.id}
                    draggableId={agent.id}
                    index={index}
                  >
                    {(provided: DraggableProvided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="flex items-center justify-between p-3 bg-card border rounded-lg group hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            {...provided.dragHandleProps}
                            className="cursor-grab text-muted-foreground hover:text-foreground"
                          >
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: agent.color || '#3B82F6' }}
                              />
                              <span className="font-medium">
                                {agent.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                #{index + 1}
                              </span>
                            </div>
                            {agent.description && (
                              <p className="text-sm text-muted-foreground truncate max-w-md">
                                {agent.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAgent(agent.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Remove from chat
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
