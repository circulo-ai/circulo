import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGeneralStore } from "@/stores/settings/general/store";
import { Info } from "lucide-react";

const TOOLTIPS = {
  autoConnect: "Automatically connect nodes.",
  autoPan: "Automatically pan to active blocks during workflow execution.",
  consoleExpandedByDefault:
    "Show console entries expanded by default. When disabled, entries will be collapsed by default.",
  floatingControls:
    "Show floating controls for zoom, undo, and redo at the bottom of the workflow canvas.",
  trainingControls:
    "Show training controls for recording workflow edits to build copilot training datasets.",
};

export function General() {
  const isLoading = useGeneralStore((state) => state.isLoading);

  return (
    <div className="px-6 pt-4 pb-2">
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <>
            {/* Theme setting with skeleton value */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="theme-select" className="font-normal">
                  Theme
                </Label>
              </div>
              <Skeleton className="h-9 w-[180px]" />
            </div>

            {/* Auto-connect setting with skeleton value */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-connect" className="font-normal">
                  Auto-connect on drop
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 p-1 text-gray-500"
                      aria-label="Learn more about auto-connect feature"
                      disabled={true}
                    >
                      <Info className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px] p-3">
                    <p className="text-sm">{TOOLTIPS.autoConnect}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>

            {/* Console expanded setting with skeleton value */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="console-expanded-by-default"
                  className="font-normal"
                >
                  Console expanded by default
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 p-1 text-gray-500"
                      aria-label="Learn more about console expanded by default"
                      disabled={true}
                    >
                      <Info className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px] p-3">
                    <p className="text-sm">
                      {TOOLTIPS.consoleExpandedByDefault}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          </>
        ) : (
          <>{/* TODO: General settings properties */}</>
        )}
      </div>
    </div>
  );
}
