"use client";

import { ComponentProps } from "react";
import {
  FieldValues,
  Form as RHForm,
  useForm,
  UseFormProps,
} from "react-hook-form";
import useSWR from "swr";
import { Form } from "../ui/form";

interface CustomFormProps<Output extends Input, Input extends FieldValues>
  extends ComponentProps<typeof RHForm> {
  useFormProps: UseFormProps;
  useSWRProps: Parameters<typeof useSWR>;
  omitFields?: (keyof Input)[];
}

export function CustomForm<Output extends Input, Input extends FieldValues>({
  useFormProps,
  useSWRProps,
  omitFields,
  children,
  ...props
}: CustomFormProps<Output, Input>) {
  const form = useForm(useFormProps);

  const { mutate } = useSWR(useSWRProps);

  return (
    <RHForm
      onSubmit={async (data) => {
        const finalData = omitFields
          ? Object.fromEntries(
              Object.entries(data).filter(([key]) => !omitFields.includes(key)),
            )
          : data;

        await mutate(finalData);
      }}
      {...props}
    >
      <Form {...form}>{children}</Form>
    </RHForm>
  );
}

// TODO could be more type safe
