import { useEffect } from "react";
import { FieldValues, UseFormReturn } from "react-hook-form";

export function useNormalizeEmptyFields<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
>(form: UseFormReturn<TFieldValues, TContext, TTransformedValues>) {
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (!name) return;
      if (values?.[name] === "")
        form.setValue(name, undefined as any, {
          shouldDirty: true,
        });
    });
    return () => subscription.unsubscribe();
  }, [form]);
}
