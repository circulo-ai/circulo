import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

interface PageSpinnerProps extends Omit<ComponentProps<"div">, "children"> {}

export function PageSpinner({ className, ...props }: PageSpinnerProps) {
  return (
    <div
      className={cn("h-screen-fix flex items-center justify-center", className)}
      {...props}
    >
      <Spinner />
    </div>
  );
}
