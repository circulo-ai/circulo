import { cn } from "@/lib/utils";
import { ChangeEvent, ComponentProps, ReactNode } from "react";
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
import { InputComponentProps } from "./controlled-input";

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

interface SelectInputProps
	extends Omit<ComponentProps<typeof Select>, "value">,
		InputComponentProps {
	options?: (Option | OptionGroup | OptionSeparator)[];
	placeholder?: ReactNode;
}

export function SelectInput({
	options,
	placeholder = "Select",
	"aria-invalid": invalid,
	onChange,
	value,
	id,
	...props
}: SelectInputProps) {
	return (
		<Select
			value={value as string | undefined}
			onValueChange={(nextValue) => {
				onChange?.({
					target: { value: String(nextValue ?? "") },
				} as ChangeEvent<HTMLInputElement>);
			}}
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
	return (rawOptions ?? []).map((option, index) =>
		option.type === "single" ? (
			<SelectItem key={option.value} value={option.value}>
				{option.label}
			</SelectItem>
		) : option.type === "group" ? (
			<SelectGroup key={`group-${index}`}>
				<SelectLabel>{option.label}</SelectLabel>
				<RenderOptions options={option.options} />
			</SelectGroup>
		) : (
			<SelectSeparator key={`separator-${index}`} />
		),
	);
}

interface CustomSelectTriggerProps
	extends ComponentProps<typeof SelectTrigger> {}

export function CustomSelectTrigger({
	className,
	...props
}: CustomSelectTriggerProps) {
	return <SelectTrigger className={cn("rounded-xl", className)} {...props} />;
}
