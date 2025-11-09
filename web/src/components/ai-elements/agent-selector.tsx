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
import { GripVertical, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AgentSelectorProps {
  availableAgents: Agent[];
  selectedAgentIds: string[];
  onSelectionChange: (agentIds: string[]) => void;
  isLoading?: boolean;
}

function SortableAgentItem({ agent, index, onRemove }: {
  agent: Agent;
  index: number;
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
    <Card ref={setNodeRef} style={style} className="p-3">
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
            <img src={agent.avatar} alt={agent.name} className="h-full w-full rounded-full" />
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
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export function AgentSelector({
                                availableAgents,
                                selectedAgentIds,
                                onSelectionChange,
                                isLoading,
                              }: AgentSelectorProps) {
  const [showAvailable, setShowAvailable] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const selectedAgents = selectedAgentIds
    .map((id) => availableAgents.find((a) => a.id === id))
    .filter(Boolean) as Agent[];

  const unselectedAgents = availableAgents.filter(
    (a) => !selectedAgentIds.includes(a.id)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedAgentIds.indexOf(active.id as string);
      const newIndex = selectedAgentIds.indexOf(over.id as string);
      const newOrder = arrayMove(selectedAgentIds, oldIndex, newIndex);
      onSelectionChange(newOrder);
    }
  };

  const handleAddAgent = (agentId: string) => {
    onSelectionChange([...selectedAgentIds, agentId]);
  };

  const handleRemoveAgent = (agentId: string) => {
    onSelectionChange(selectedAgentIds.filter((id) => id !== agentId));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selected Agents - Sortable */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Selected Agents {selectedAgents.length > 0 && `(${selectedAgents.length})`}
          </h3>
          {selectedAgents.length > 1 && (
            <span className="text-xs text-muted-foreground">Drag to reorder speaking sequence</span>
          )}
        </div>

        {selectedAgents.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <p className="text-sm text-muted-foreground">
              No agents selected yet. Choose from available agents below.
            </p>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={selectedAgentIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {selectedAgents.map((agent, index) => (
                  <SortableAgentItem
                    key={agent.id}
                    agent={agent}
                    index={index}
                    onRemove={() => handleRemoveAgent(agent.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Available Agents */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAvailable(!showAvailable)}
          className="w-full justify-between"
        >
          <span className="text-sm font-semibold">
            Available Agents {unselectedAgents.length > 0 && `(${unselectedAgents.length})`}
          </span>
          <span className="text-xs">{showAvailable ? "Hide" : "Show"}</span>
        </Button>

        {showAvailable && (
          <ScrollArea className="h-[300px] rounded-md border">
            <div className="p-2 space-y-2">
              {unselectedAgents.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {availableAgents.length === 0
                      ? "No agents available. Create an agent first."
                      : "All available agents have been selected."}
                  </p>
                </div>
              ) : (
                unselectedAgents.map((agent) => (
                  <Card
                    key={agent.id}
                    className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleAddAgent(agent.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold"
                        style={{ backgroundColor: agent.color || "#3B82F6" }}
                      >
                        {agent.avatar ? (
                          <img src={agent.avatar} alt={agent.name} className="h-full w-full rounded-full" />
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
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}