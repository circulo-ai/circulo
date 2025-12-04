import { cn } from "@/lib/utils";
import { ComponentProps, InputHTMLAttributes } from "react";
import { Input } from "../ui/input";

interface CustomInputProps extends ComponentProps<typeof Input> {
  type?: "number" | "email" | "password" | "search" | "tel" | "text" | "url";
}

export function BasicInput({
  className,
  type = "text",
  ...props
}: CustomInputProps) {
  const inputModes: Record<
    typeof type,
    InputHTMLAttributes<HTMLInputElement>["inputMode"]
  > = {
    number: "numeric",
    email: "email",
    password: undefined, // text
    search: "search",
    tel: "tel",
    text: undefined, // text
    url: "url",
  };

  /*
  const dirs: Record<
    typeof type,
    InputHTMLAttributes<HTMLInputElement>["dir"]
  > = {
    number: "ltr",
    email: "ltr",
    password: "ltr",
    search: "rtl",
    tel: "ltr",
    text: "rtl",
    url: "ltr",
  };
  */

  return (
    <Input
      type="text"
      // dir={dirs[type]}
      inputMode={inputModes[type]}
      className={cn(className, "")}
      {...props}
    />
  );
}
