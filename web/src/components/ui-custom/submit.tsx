"use client";

import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";
import { Button } from "../ui/button";

interface SubmitProps extends React.ComponentProps<typeof Button> {}

export function Submit({ disabled, className, ...props }: SubmitProps) {
  const {
    formState: { isSubmitting },
  } = useFormContext();

  return (
    <Button
      className={cn(isSubmitting && "animate-pulse", className)}
      type="submit"
      disabled={disabled ?? isSubmitting}
      {...props}
    />
  );
}
