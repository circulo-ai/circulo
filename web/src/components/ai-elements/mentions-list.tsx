export type MentionsListProps = {
  mentions: MentionEntity[];
  onRemove?: (id: string) => void;
  className?: string;
};

export const MentionsList = ({
                               mentions,
                               onRemove,
                               className,
                             }: MentionsListProps) => {
  if (mentions.length === 0) return null;

  return (
    <InputGroupAddon
      align="block-start"
      className={cn("gap-1.5 py-2", className)}
    >
      <div className="flex flex-wrap gap-1.5">
        {mentions.map((mention) => (
          <MentionBadge
            key={mention.id}
            mention={mention}
            onRemove={onRemove ? () => onRemove(mention.id) : undefined}
          />
        ))}
      </div>
    </InputGroupAddon>
  );
};