import { cn } from "@/lib/utils";
import { AccordionTrigger } from "@radix-ui/react-accordion";
import { ComponentProps } from "react";

interface CustomAccordionTriggerProps
  extends ComponentProps<typeof AccordionTrigger> {}

export function CustomAccordionTrigger({
  className,
  ...props
}: CustomAccordionTriggerProps) {
  return (
    <AccordionTrigger
      className={cn("ms-auto text-foreground/75", className)}
      {...props}
    />
  );
}
