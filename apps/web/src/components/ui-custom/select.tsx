import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { ComponentProps, ReactNode, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface Option {
  value: string;
  label: ReactNode;
  type: "single";
}

interface OptionGroup {
  label: ReactNode;
  options: Option[];
  type: "group";
}

interface OptionSeparator {
  type: "separator";
}

interface OptionWithKey extends Option {
  key: string;
}

interface OptionGroupWithKey extends OptionGroup {
  key: string;
}

interface OptionSeparatorWithKey extends OptionSeparator {
  key: string;
}

interface SelectInputProps
  extends Omit<
      ComponentProps<"input">,
      "placeholder" | "defaultValue" | "value" | "dir"
    >,
    Pick<ComponentProps<typeof Select>, "defaultValue" | "value" | "dir"> {
  options?: (Option | OptionGroup | OptionSeparator)[];
  placeholder?: ReactNode;
}

export function SelectInput({
  options,
  placeholder = "Select",
  "aria-invalid": invalid,
  onChange,
  id,
  ...props
}: SelectInputProps) {
  return (
    <Select
      onValueChange={onChange as ((value: string) => void) | undefined}
      {...props}
    >
      <CustomSelectTrigger id={id} aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </CustomSelectTrigger>
      <SelectContent>
        <RenderOptions options={options} />
      </SelectContent>
    </Select>
  );
}

function RenderOptions({
  options: rawOptions,
}: Pick<SelectInputProps, "options">) {
  const options = useMemo(
    () =>
      rawOptions?.map((option) => {
        if (option.type === "single")
          return { ...option, key: nanoid() } as OptionWithKey;
        else if (option.type === "group")
          return { ...option, key: nanoid() } as OptionGroupWithKey;
        else
          return {
            ...option,
            key: nanoid(),
          } as OptionSeparatorWithKey;
      }) ?? [],
    [rawOptions],
  );

  return options.map((option) =>
    option.type === "single" ? (
      <SelectItem key={option.key} value={option.value}>
        {option.label}
      </SelectItem>
    ) : option.type === "group" ? (
      <SelectGroup key={option.key}>
        <SelectLabel>{option.label}</SelectLabel>
        <RenderOptions options={option.options} />
      </SelectGroup>
    ) : (
      <SelectSeparator key={option.key} />
    ),
  );
}

interface CustomSelectTriggerProps
  extends ComponentProps<typeof SelectTrigger> {}

export function CustomSelectTrigger({
  className,
  ...props
}: CustomSelectTriggerProps) {
  return <SelectTrigger className={cn("rounded-full", className)} {...props} />;
}
