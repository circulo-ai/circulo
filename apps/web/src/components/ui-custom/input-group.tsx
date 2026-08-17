import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { TextInput } from "./text-input";

interface CustomInputGroupProps extends ComponentProps<typeof InputGroup> {}

export function CustomInputGroup({
  className,
  ...props
}: CustomInputGroupProps) {
  return (
    <InputGroup
      className={cn(className, "overflow-hidden rounded-[1.125rem]")}
      {...props}
    />
  );
}

interface CustomInputGroupInputProps extends ComponentProps<
  typeof TextInput
> {}

export function CustomInputGroupInput({
  className,
  ...props
}: CustomInputGroupInputProps) {
  return (
    <TextInput
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
