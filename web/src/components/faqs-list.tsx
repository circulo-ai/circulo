"use client";

import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export function FaqsList({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("", className)} {...props}></div>;
}
