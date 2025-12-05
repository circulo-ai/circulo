import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
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

interface CustomInputGroupInputProps
  extends ComponentProps<typeof InputGroupInput> {}

export function CustomInputGroupInput({
  className,
  ...props
}: CustomInputGroupInputProps) {
  return (
    <InputGroupInput as={TextInput} className={cn(className)} {...props} />
  );
}
