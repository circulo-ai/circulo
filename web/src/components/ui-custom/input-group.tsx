import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { InputGroup, InputGroupInput } from "../ui/input-group";
import { CustomInput } from "./input";

interface CustomInputGroupProps extends ComponentProps<typeof InputGroup> { }

export function CustomInputGroup({
  className,
  ...props
}: CustomInputGroupProps) {
  return <InputGroup className={cn(className, "rounded-full")} {...props} />;
}

interface CustomInputGroupInputProps
  extends ComponentProps<typeof InputGroupInput> { }

export function CustomInputGroupInput({
  className,
  ...props
}: CustomInputGroupInputProps) {
  return (
    <InputGroupInput
      as={CustomInput as any}
      className={cn(className, "")}
      {...props}
    />
  );
}
