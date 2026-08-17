import { ChangeEvent, ComponentProps } from "react";
import { Slider } from "../ui/slider";
import { InputComponentProps } from "./controlled-input";

interface SliderInputProps
  extends
    Omit<
      ComponentProps<typeof Slider>,
      "value" | "onChange" | "onBlur" | "ref"
    >,
    InputComponentProps {}

export function SliderInput({ onChange, value, ...props }: SliderInputProps) {
  return (
    <Slider
      value={normalizeValue(value)}
      onValueChange={(newValue) => {
        const nextValue = Array.isArray(newValue) ? newValue[0] : newValue;
        if (onChange && nextValue !== undefined)
          onChange({
            target: { value: nextValue },
          } as unknown as ChangeEvent<Element>);
      }}
      {...props}
    />
  );
}

function normalizeValue(value: SliderInputProps["value"]) {
  if (typeof value === "string") return [parseInt(value) || 0];
  else if (typeof value === "number") return [value];
  else if (Array.isArray(value))
    return value.map((item) => parseInt(item) || 0);
  else return [];
}
