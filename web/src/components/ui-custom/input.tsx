import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { Input } from "../ui/input";

interface CustomInputProps extends ComponentProps<typeof Input> {}

export function CustomInput({ className, ...props }: CustomInputProps) {
  return <Input className={cn(className, "")} {...props} />;
}
