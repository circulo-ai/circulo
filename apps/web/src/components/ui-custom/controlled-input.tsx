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
  ControllerRenderProps,
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
}

interface ControlledInputProps<T extends FieldValues>
  extends ComponentProps<typeof Field> {
  name: Path<T>;
  title?: string;
  description?: string;
  saveAsNumber?: boolean;
  addons?: ReactNode;
  inputComponent: FC<InputComponentProps>;
  inputProps?: ComponentProps<"input">;
  unstyled?: boolean;
}

export function ControlledInput<T extends FieldValues>({
  name,
  title,
  description,
  saveAsNumber = false,
  addons,
  inputComponent: InputComponent,
  inputProps = {},
  unstyled,
  id: explicitId,
  ...props
}: ControlledInputProps<T>) {
  const implicitId = useId();
  const id = explicitId ?? implicitId;

  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { invalid, error } }) =>
        unstyled ? (
          <FormInputAdapter<T>
            id={id}
            field={field}
            invalid={invalid}
            inputProps={inputProps}
            saveAsNumber={saveAsNumber}
            inputComponent={InputComponent}
          />
        ) : (
          <Field data-invalid={invalid} {...props}>
            <FieldLabel htmlFor={id}>{title ?? camelToTitle(name)}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
            <CustomInputGroup>
              <FormInputAdapter<T>
                id={id}
                field={field}
                invalid={invalid}
                inputProps={inputProps}
                saveAsNumber={saveAsNumber}
                inputComponent={InputComponent}
              />
              {addons}
            </CustomInputGroup>
            {invalid && <FieldError errors={[error]} />}
          </Field>
        )
      }
    />
  );
}

const FormInputAdapter = <T extends FieldValues>({
  id,
  field: { value, onChange, ...field },
  invalid,
  inputProps,
  saveAsNumber,
  inputComponent: InputComponent,
}: {
  id: string;
  field: ControllerRenderProps<FieldValues, Path<T>>;
  invalid: boolean;
  inputProps: ComponentProps<"input">;
  saveAsNumber: boolean;
  inputComponent: FC<InputComponentProps>;
}) => {
  // TODO convert to a utility
  const extractDigitsOnly = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      convertPersianToEnglishNumbers(e.target.value).replace(/\D/g, ""),
    [],
  );

  // TODO convert to a utility
  const extractNumberFromInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      parseInt(extractDigitsOnly(event)),
    [extractDigitsOnly],
  );

  return (
    <InputComponent
      id={id} // TODO pass these props only if InputComponent accepts them
      aria-invalid={invalid}
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
  );
};

// TODO make it type safe
