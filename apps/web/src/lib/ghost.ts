import { cn } from "./utils";

interface GhostProps {
  isGhost: boolean;
  className?: string;
}

export function getGhostProps({ isGhost, className }: GhostProps) {
  return {
    className: cn(
      isGhost && "pointer-events-none absolute size-0 opacity-0",
      className,
    ),
    "aria-hidden": isGhost,
  };
}
