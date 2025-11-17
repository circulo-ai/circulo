import { ReactNode, Suspense } from "react";
import { Delayed } from "./delayed";

export function DebouncedSuspense({
  delay = 300,
  fallback,
  children,
}: {
  delay?: number;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<Delayed delay={delay}>{fallback}</Delayed>}>
      {children}
    </Suspense>
  );
}
