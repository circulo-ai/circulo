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
> extends Omit<ComponentProps<typeof RHForm<Input>>, "onSubmit"> {
  form: UseFormReturn<Input>;
  swr: { trigger: (props: Output) => Promise<unknown> };
  omitFields?: (keyof Input)[];
  onSubmit?: (data: Input) => void | Promise<void>;
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
        onSubmit={async ({ data }) => {
          const finalData = omitFields
            ? Object.fromEntries(
                Object.entries(data).filter(
                  ([key]) => !omitFields.includes(key),
                ),
              )
            : data;

          await trigger(finalData as Output);
          await onSubmit?.(data);
        }}
        {...props}
      >
        {children}
      </RHForm>
    </FormProvider>
  );
}
