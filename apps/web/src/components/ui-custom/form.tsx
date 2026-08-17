"use client";

import { useNormalizeEmptyFields } from "@/hooks/use-normalize-empty-fields";
import { ComponentProps } from "react";
import {
	FieldValues,
	FormProvider,
	Form as RHForm,
	UseFormReturn,
} from "react-hook-form";

interface CustomFormProps<
	Input extends FieldValues = FieldValues,
	Output = Input,
> extends ComponentProps<typeof RHForm<Input>> {
	form: UseFormReturn<Input>;
	swr: { trigger: (props: Output) => Promise<unknown> };
	omitFields?: (keyof Input)[];
}

export function CustomForm<
	Input extends FieldValues = FieldValues,
	Output = Input,
>({
	form,
	swr: { trigger },
	omitFields,
	children,
	onSubmit,
	...props
}: CustomFormProps<Input, Output>) {
	useNormalizeEmptyFields(form);
	return (
		<FormProvider<Input> {...form}>
			<RHForm<Input>
				onSubmit={async (payload) => {
					const finalData = omitFields
						? Object.fromEntries(
								Object.entries(payload).filter(
									([key]) => !omitFields.includes(key),
								),
							)
						: payload;

					await trigger(finalData as Output);
					onSubmit?.(payload);
				}}
				{...props}
			>
				{children}
			</RHForm>
		</FormProvider>
	);
}
