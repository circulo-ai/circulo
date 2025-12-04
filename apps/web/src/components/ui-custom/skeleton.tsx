import { cn } from "@/lib/utils";
import { ComponentProps } from "react";
import { Skeleton } from "../ui/skeleton";

interface CustomSkeletonProps extends ComponentProps<"div"> {}

export function CustomSkeleton({ className, ...props }: CustomSkeletonProps) {
  return <Skeleton className={cn(className, "bg-teal-50/5")} {...props} />;
}
