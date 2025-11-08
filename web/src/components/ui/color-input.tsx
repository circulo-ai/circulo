import * as React from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface ColorInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
}

export const ColorInput = React.forwardRef<HTMLInputElement, ColorInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const [color, setColor] = React.useState(value || "#000000");

    React.useEffect(() => {
      if (value) {
        setColor(value);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setColor(e.target.value);
      onChange?.(e.target.value);
    };

    return (
      <div className="flex gap-2 items-center">
        <Input
          ref={ref}
          type="color"
          value={color}
          onChange={handleChange}
          className={cn("h-10 w-20", className)}
          {...props}
        />
        <Input
          type="text"
          value={color}
          onChange={handleChange}
          pattern="^#[0-9A-Fa-f]{6}$"
          className="flex-1"
        />
      </div>
    );
  }
);

ColorInput.displayName = "ColorInput";
