"use client";

import { camelToTitle } from "@/lib/camel-to-title";
import { convertPersianToEnglishNumbers } from "@/lib/convert-persian-to-english-numbers";
import {
  ChangeEvent,
  ChangeEventHandler,
  ComponentProps,
  FC,
  FocusEventHandler,
  ReactNode,
  Ref,
  useCallback,
  useId,
} from "react";
import {
  Controller,
  ControllerFieldState,
  FieldValues,
  Path,
  useFormContext,
} from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { CustomInputGroup } from "./input-group";

export interface InputComponentProps
  extends Pick<
    ComponentProps<"input">,
    | "id"
    | "aria-invalid"
    | "value"
    | "onChange"
    | "onBlur"
    | "disabled"
    | "name"
    | "ref"
  > {
  onChange?: ChangeEventHandler;
  onBlur?: FocusEventHandler;
  ref?: Ref<any>;
  context: {
    fieldState: ControllerFieldState;
  };
}

interface ControlledInputProps<T extends FieldValues>
  extends ComponentProps<typeof Field> {
  name: Path<T>;
  title?: string;
  description?: string;
  saveAsNumber?: boolean;
  inputProps?: ComponentProps<"input">;
  addons?: ReactNode;
  inputComponent: FC<InputComponentProps>;
}

export const ControlledInput = <T extends FieldValues>({
  name,
  title,
  description,
  saveAsNumber,
  inputProps,
  addons,
  inputComponent: InputComponent,
  ...props
}: ControlledInputProps<T>) => {
  const id = useId();

  const { control } = useFormContext();

  const extractDigitsOnly = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      convertPersianToEnglishNumbers(e.target.value).replace(/\D/g, ""),
    [],
  );

  const extractNumberFromInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      parseInt(extractDigitsOnly(event)),
    [extractDigitsOnly],
  );

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { value, onChange, ...field }, fieldState }) => (
        <Field data-invalid={fieldState.invalid} {...props}>
          <FieldLabel htmlFor={id}>{title ?? camelToTitle(name)}</FieldLabel>
          {description && <FieldDescription>{description}</FieldDescription>}
          <CustomInputGroup>
            <InputComponent
              id={id}
              aria-invalid={fieldState.invalid}
              context={{ fieldState }}
              value={value ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onChange(
                  inputProps?.type === "number"
                    ? saveAsNumber
                      ? isNaN(extractNumberFromInput(e))
                        ? 0
                        : extractNumberFromInput(e)
                      : extractDigitsOnly(e)
                    : e.target.value,
                )
              }
              {...inputProps}
              {...field}
            />
            {addons}
          </CustomInputGroup>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
};
