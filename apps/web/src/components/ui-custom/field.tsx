import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { Field } from "../ui/field";

interface CustomFieldProps extends ComponentProps<typeof Field> {}

export function CustomField({ className, ...props }: CustomFieldProps) {
  return <Field className={cn("items-center!", className)} {...props} />;
}
