"use client";

import { Agent } from "@/db/schema/agent";
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ChatAgentManagerProps {
  chatAgents: Agent[];
  allAgents: Agent[];
  onReorder: (agents: Array<{ agentId: string; speakOrder: number }>) => Promise<void>;
  onRemove: (agentId: string) => Promise<void>;
  onClose: () => void;
}

function SortableChatAgent({
                             agent,
                             index,
                             isExpanded,
                             onToggle,
                             onRemove,
                           }: {
  agent: Agent;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <div className="p-3">
          <div className="flex items-center gap-3">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
            <Badge variant="outline" className="shrink-0">
              #{index + 1}
            </Badge>
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
              style={{ backgroundColor: agent.color || "#3B82F6" }}
            >
              {agent.avatar ? (
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="h-full w-full rounded-full"
                />
              ) : (
                agent.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{agent.name}</p>
              {agent.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {agent.description}
                </p>
              )}
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings2 className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 space-y-4 border-t mt-3 pt-3">
            <div className="space-y-2">
              <Label className="text-xs">Model</Label>
              <p className="text-sm font-mono">{agent.model}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Temperature</Label>
              <p className="text-sm">{agent.temperature}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">System Prompt</Label>
              <p className="text-sm text-muted-foreground">
                {agent.systemPrompt.substring(0, 200)}
                {agent.systemPrompt.length > 200 ? "..." : ""}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function ChatAgentManager({
                                   chatAgents,
                                   allAgents,
                                   onReorder,
                                   onRemove,
                                   onClose,
                                 }: ChatAgentManagerProps) {
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [localAgents, setLocalAgents] = useState(chatAgents);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localAgents.findIndex((a) => a.id === active.id);
      const newIndex = localAgents.findIndex((a) => a.id === over.id);
      const newOrder = arrayMove(localAgents, oldIndex, newIndex);

      setLocalAgents(newOrder);

      const updates = newOrder.map((agent, index) => ({
        agentId: agent.id,
        speakOrder: index,
      }));

      await onReorder(updates);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Manage Chat Agents</h3>
          <p className="text-sm text-muted-foreground">
            Reorder agents to control speaking sequence
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {localAgents.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            No agents in this chat. Add agents to start collaborating.
          </p>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localAgents.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {localAgents.map((agent, index) => (
                <SortableChatAgent
                  key={agent.id}
                  agent={agent}
                  index={index}
                  isExpanded={expandedAgentId === agent.id}
                  onToggle={() =>
                    setExpandedAgentId(
                      expandedAgentId === agent.id ? null : agent.id
                    )
                  }
                  onRemove={() => onRemove(agent.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}