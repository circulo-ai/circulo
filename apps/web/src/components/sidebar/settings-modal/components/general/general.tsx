import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGeneralStore } from "@/stores/settings/general/store";
import { useTheme } from "next-themes";
import { useEffect } from "react";

export function General() {
  const isLoading = useGeneralStore((state) => state.isLoading);
  const theme = useGeneralStore((state) => state.theme);
  const updateSetting = useGeneralStore((state) => state.updateSetting);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!isLoading) setTheme(theme);
  }, [isLoading, setTheme, theme]);

  return (
    <div className="px-6 pt-4 pb-2">
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex items-center justify-between">
            <Label htmlFor="theme-select" className="font-normal">
              Theme
            </Label>
            <Skeleton className="h-9 w-[180px]" />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Label htmlFor="theme-select" className="font-normal">
              Theme
            </Label>
            <Select
              onValueChange={(value) => {
                const nextTheme = value as typeof theme;
                setTheme(nextTheme);
                void updateSetting("theme", nextTheme);
              }}
              value={theme}
            >
              <SelectTrigger id="theme-select" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
