import { Badge } from "@/components/ui/badge";
import { MentionEntity } from "@/lib/chat/mentions/types";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

export type MentionBadgeProps = {
  mention: MentionEntity;
  onRemove?: () => void;
  className?: string;
};

export const MentionBadge = ({
  mention,
  onRemove,
  className,
}: MentionBadgeProps) => (
  <Badge
    variant="secondary"
    className={cn(
      "gap-1.5 pr-1",
      mention.type === "agent"
        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
        : "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
      className,
    )}
  >
    <span className="text-xs font-bold">
      {mention.type === "agent" ? "@" : "#"}
    </span>
    <span className="text-xs">{mention.name}</span>
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
      >
        <XIcon className="h-3 w-3" />
      </button>
    )}
  </Badge>
);
