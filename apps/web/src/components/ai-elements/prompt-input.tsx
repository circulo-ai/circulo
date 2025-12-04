"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import {
  AtSign,
  Calendar,
  Hash,
  Loader2,
  Send,
  Square,
  X,
  Zap,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";
import {
  Children,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Command, CommandInput, CommandItem, CommandList } from "../ui/command";

export type PromptInputProps = HTMLAttributes<HTMLDivElement>;

export const PromptInput = ({ className, ...props }: PromptInputProps) => (
  <div
    className={cn(
      "w-full overflow-hidden rounded-xl border bg-background shadow-xs",
      className,
    )}
    {...props}
  />
);

export type CommandItemType = {
  type: "command";
  name: string;
  icon: React.ReactNode;
  command: string;
};

export type MentionItemType = {
  type: "mention";
  name: string;
  icon: React.ReactNode;
  username: string;
};

const defaultCommands: CommandItemType[] = [
  {
    type: "command",
    name: "Search",
    icon: <Hash size={14} />,
    command: "search",
  },
  {
    type: "command",
    name: "Analyze",
    icon: <Zap size={14} />,
    command: "analyze",
  },
  {
    type: "command",
    name: "Remind",
    icon: <Calendar size={14} />,
    command: "remind",
  },
];

const defaultMentions: MentionItemType[] = [
  {
    type: "mention",
    name: "Alice Johnson",
    icon: <AtSign size={14} />,
    username: "alice",
  },
  {
    type: "mention",
    name: "Bob Smith",
    icon: <AtSign size={14} />,
    username: "bob",
  },
  {
    type: "mention",
    name: "Charlie Brown",
    icon: <AtSign size={14} />,
    username: "charlie",
  },
];

export type PromptInputTextareaProps = Omit<
  React.ComponentProps<"textarea">,
  "value" | "onChange"
> & {
  minHeight?: number;
  maxHeight?: number;
  disableAutoResize?: boolean;
  enableCommands?: boolean;
  enableMentions?: boolean;
  commands?: CommandItemType[];
  mentions?: MentionItemType[];
  fetchMentions?: (query: string) => Promise<MentionItemType[]>;
  fetchCommands?: (query: string) => Promise<CommandItemType[]>;
  debounceMs?: number;
  value?: string;
  onChange?:
    | ((event: React.ChangeEvent<HTMLTextAreaElement>) => void)
    | ((value: string) => void);
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
};

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(
  (
    {
      className,
      placeholder = "What would you like to know?",
      minHeight = 48,
      maxHeight = 164,
      disableAutoResize = false,
      enableCommands = false,
      enableMentions = false,
      commands = defaultCommands,
      mentions = defaultMentions,
      value: controlledValue,
      onChange,
      onValueChange,
      name = "message",
      debounceMs = 150,
      fetchMentions,
      fetchCommands,
      ...props
    },
    ref,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [internalValue, setInternalValue] = useState("");
    const [open, setOpen] = useState(false);
    const [trigger, setTrigger] = useState<null | "command" | "mention">(null);
    const [query, setQuery] = useState("");
    const [items, setItems] = useState<(CommandItemType | MentionItemType)[]>(
      [],
    );
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useImperativeHandle(ref, () => textareaRef.current!);

    const value = controlledValue ?? internalValue;

    const handleValueChange = useCallback(
      (newValue: string) => {
        setInternalValue(newValue);
        if (onValueChange) onValueChange(newValue);
        if (onChange) {
          if (typeof onChange === "function") {
            try {
              (onChange as any)({ target: { value: newValue } });
            } catch {
              (onChange as (value: string) => void)(newValue);
            }
          }
        }
      },
      [onChange, onValueChange],
    );

    const checkForTriggers = useCallback(
      (text: string, caretPos: number) => {
        const beforeCaret = text.substring(0, caretPos);

        // Check for mention trigger (@) - can be anywhere
        const mentionMatch = enableMentions
          ? beforeCaret.match(/@(\w*)$/)
          : null;

        // Check for command trigger (/) - ONLY at the very start of the textarea
        let commandMatch = null;
        if (enableCommands) {
          // Only match if the entire text starts with /
          const match = beforeCaret.match(/^\/(\w*)$/);
          if (match) {
            commandMatch = match[1] ?? "";
          }
        }

        if (mentionMatch) {
          return { trigger: "mention" as const, query: mentionMatch[1] ?? "" };
        } else if (commandMatch !== null) {
          return { trigger: "command" as const, query: commandMatch };
        }

        return null;
      },
      [enableCommands, enableMentions],
    );

    const fetchSuggestions = useCallback(
      async (type: "command" | "mention", searchQuery: string) => {
        setLoading(true);
        try {
          if (type === "mention") {
            const source = fetchMentions
              ? await fetchMentions(searchQuery)
              : mentions;

            const filtered = source.filter(
              (m) =>
                m.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.name.toLowerCase().includes(searchQuery.toLowerCase()),
            );
            setItems(filtered);
          } else {
            const source = fetchCommands
              ? await fetchCommands(searchQuery)
              : commands;

            const filtered = source.filter(
              (c) =>
                c.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.name.toLowerCase().includes(searchQuery.toLowerCase()),
            );
            setItems(filtered);
          }
        } catch (error) {
          console.error("Failed to fetch items:", error);
          setItems([]);
        } finally {
          setLoading(false);
        }
      },
      [commands, mentions, fetchMentions, fetchCommands],
    );

    // Reset selected index when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        handleValueChange(newValue);

        if (!enableCommands && !enableMentions) return;

        const caretPos = e.target.selectionStart;
        const triggerInfo = checkForTriggers(newValue, caretPos);

        if (triggerInfo) {
          setTrigger(triggerInfo.trigger);
          setQuery(triggerInfo.query);
          setOpen(true);

          if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
          }

          fetchTimeoutRef.current = setTimeout(() => {
            fetchSuggestions(triggerInfo.trigger, triggerInfo.query);
          }, debounceMs);
        } else {
          setOpen(false);
          setTrigger(null);
          setQuery("");
        }
      },
      [
        handleValueChange,
        enableCommands,
        enableMentions,
        checkForTriggers,
        fetchSuggestions,
        debounceMs,
      ],
    );

    const handleSelect = useCallback(
      (item: CommandItemType | MentionItemType) => {
        if (!textareaRef.current) return;

        const text = value;
        const cursorPosition = textareaRef.current.selectionStart;

        const beforeCursor = text.substring(0, cursorPosition);
        const afterCursor = text.substring(cursorPosition);

        const match = beforeCursor.match(/([/@])(\w*)$/);
        if (!match) return;

        const triggerStart = beforeCursor.length - match[0].length;
        const beforeTrigger = text.substring(0, triggerStart);

        let replacement = "";
        if (item.type === "command") {
          replacement = `/${item.command}`;
        } else {
          replacement = `@${item.username}`;
        }

        const newText = beforeTrigger + replacement + " " + afterCursor;

        handleValueChange(newText);
        setOpen(false);
        setTrigger(null);
        setQuery("");

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = (beforeTrigger + replacement + " ").length;
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      },
      [value, handleValueChange],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (open && items.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % items.length);
            return;
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(
              (prev) => (prev - 1 + items.length) % items.length,
            );
            return;
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            handleSelect(items[selectedIndex]);
            return;
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setTrigger(null);
            setQuery("");
            return;
          }
        }

        if (e.key === "Enter") {
          if (e.shiftKey) {
            return;
          }

          e.preventDefault();
          const form = textareaRef.current?.closest("form");
          if (form) {
            form.requestSubmit();
          }
        }
      },
      [open, items, selectedIndex, handleSelect],
    );

    const textareaClasses = useMemo(
      () =>
        cn(
          "w-full resize-none border-none bg-transparent p-3 shadow-none ring-0 outline-none",
          "focus-visible:ring-0",
          "text-[15px] leading-[1.5]",
          className,
        ),
      [className],
    );

    if (!enableCommands && !enableMentions) {
      return (
        <textarea
          ref={textareaRef}
          className={textareaClasses}
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          name={name}
          style={{ minHeight, maxHeight }}
          {...props}
        />
      );
    }

    return (
      <Popover open={open} modal={false}>
        <PopoverTrigger asChild>
          <textarea
            ref={textareaRef}
            className={textareaClasses}
            placeholder={placeholder}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            name={name}
            style={{ minHeight, maxHeight }}
            {...props}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-64 p-0"
          side="top"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput
              value={query}
              onValueChange={(newQuery) => {
                setQuery(newQuery);
                if (trigger) {
                  fetchSuggestions(trigger, newQuery);
                }
              }}
              placeholder={
                trigger === "command" ? "Search commands..." : "Search users..."
              }
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : items.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No results found
                </div>
              ) : (
                items.map((item, idx) => (
                  <CommandItem
                    key={`${item.type}-${item.name}-${idx}`}
                    onSelect={() => handleSelect(item)}
                    className={cn(
                      "cursor-pointer",
                      idx === selectedIndex && "bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.type === "command"
                          ? `/${item.command}`
                          : `@${item.username}`}
                      </span>
                    </div>
                  </CommandItem>
                ))
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

PromptInputTextarea.displayName = "PromptInputTextarea";

export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputToolbar = ({
  className,
  ...props
}: PromptInputToolbarProps) => (
  <div
    className={cn("flex items-center justify-between p-1", className)}
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({
  className,
  ...props
}: PromptInputToolsProps) => (
  <div
    className={cn(
      "flex items-center gap-1",
      "[&_button:first-child]:rounded-bl-xl",
      className,
    )}
    {...props}
  />
);

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export const PromptInputButton = ({
  variant = "ghost",
  className,
  size,
  ...props
}: PromptInputButtonProps) => {
  const newSize =
    (size ?? Children.count(props.children) > 1) ? "default" : "icon";

  return (
    <Button
      className={cn(
        "shrink-0 gap-1.5 rounded-lg",
        variant === "ghost" && "text-muted-foreground",
        newSize === "default" && "px-3",
        className,
      )}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon",
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let Icon = <Send className="size-4" />;

  if (status === "submitted") {
    Icon = <Loader2 className="size-4 animate-spin" />;
  } else if (status === "streaming") {
    Icon = <Square className="size-4" />;
  } else if (status === "error") {
    Icon = <X className="size-4" />;
  }

  return (
    <Button
      className={cn("gap-1.5 rounded-lg", className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </Button>
  );
};

export type PromptInputModelSelectProps = ComponentProps<typeof Select>;

export const PromptInputModelSelect = (props: PromptInputModelSelectProps) => (
  <Select {...props} />
);

export type PromptInputModelSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

export const PromptInputModelSelectTrigger = ({
  className,
  ...props
}: PromptInputModelSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors",
      "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
      "h-auto px-2 py-1.5",
      className,
    )}
    {...props}
  />
);

export type PromptInputModelSelectContentProps = ComponentProps<
  typeof SelectContent
>;

export const PromptInputModelSelectContent = ({
  className,
  ...props
}: PromptInputModelSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
);

export type PromptInputModelSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputModelSelectItem = ({
  className,
  ...props
}: PromptInputModelSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

export type PromptInputModelSelectValueProps = ComponentProps<
  typeof SelectValue
>;

export const PromptInputModelSelectValue = ({
  className,
  ...props
}: PromptInputModelSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);
