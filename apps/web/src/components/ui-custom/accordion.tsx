import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { AccordionTrigger } from "../ui/accordion";

interface CustomAccordionTriggerProps extends ComponentProps<
  typeof AccordionTrigger
> {}

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
