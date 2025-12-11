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
  swr: { trigger: (props: Output) => Promise<void> };
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
          onSubmit?.(payload);

          const finalData = omitFields
            ? Object.fromEntries(
                Object.entries(payload.data).filter(
                  ([key]) => !omitFields.includes(key),
                ),
              )
            : payload.data;

          await trigger(finalData as Output);
        }}
        {...props}
      >
        {children}
      </RHForm>
    </FormProvider>
  );
}
