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
  useMemo,
} from "react";
import {
  Controller,
  ControllerRenderProps,
  FieldValues,
  Path,
  useFormContext,
} from "react-hook-form";
import {
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../ui/field";
import { CustomField } from "./field";
import { CustomInputGroup } from "./input-group";

export interface InputComponentProps extends Pick<
  ComponentProps<"input">,
  | "id"
  | "aria-invalid"
  | "value"
  | "onChange"
  | "onBlur"
  | "disabled"
  | "name"
  | "ref"
  | "type"
> {
  onChange?: ChangeEventHandler;
  onBlur?: FocusEventHandler;
  ref?: Ref<any>;
}

interface ControlledInputProps<
  T extends FieldValues,
  ExtendedInputComponentProps extends InputComponentProps,
> extends ComponentProps<typeof CustomField> {
  name: Path<T>;
  title?: string;
  description?: string;
  saveAsNumber?: boolean;
  addons?: ReactNode;
  inputComponent: FC<ExtendedInputComponentProps>;
  inputProps?: ExtendedInputComponentProps;
  inputStyle?: "default" | "no-input-group" | "unstyled";
  errorPosition?: "before-input" | "after-input";
}

export function ControlledInput<
  T extends FieldValues,
  ExtendedInputComponentProps extends InputComponentProps,
>({
  name,
  title: rawTitle,
  description,
  saveAsNumber = false,
  addons,
  inputComponent: InputComponent,
  inputProps = {} as ExtendedInputComponentProps,
  inputStyle = "default",
  orientation = "vertical",
  errorPosition = "after-input",
  id: explicitId,
  className,
  ...props
}: ControlledInputProps<T, ExtendedInputComponentProps>) {
  const implicitId = useId();
  const id = useMemo(() => explicitId ?? implicitId, [explicitId, implicitId]);
  const title = useMemo(() => rawTitle ?? camelToTitle(name), [rawTitle, name]);

  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { invalid, error } }) =>
        inputStyle === "unstyled" ? (
          <FormInputAdapter<T, ExtendedInputComponentProps>
            id={id}
            field={field}
            invalid={invalid}
            className={className}
            inputProps={inputProps}
            saveAsNumber={saveAsNumber}
            inputComponent={InputComponent}
          />
        ) : (
          <CustomField
            orientation={orientation}
            data-invalid={invalid}
            className={className}
            {...props}
          >
            <FieldContent>
              <FieldLabel htmlFor={id}>{title}</FieldLabel>
              {description && (
                <FieldDescription>{description}</FieldDescription>
              )}
              {errorPosition === "before-input" && invalid && (
                <FieldError errors={[error]} />
              )}
            </FieldContent>
            {inputStyle === "no-input-group" ? (
              <FormInputAdapter<T, ExtendedInputComponentProps>
                id={id}
                field={field}
                invalid={invalid}
                inputProps={inputProps}
                saveAsNumber={saveAsNumber}
                inputComponent={InputComponent}
              />
            ) : (
              <CustomInputGroup>
                <FormInputAdapter<T, ExtendedInputComponentProps>
                  id={id}
                  field={field}
                  invalid={invalid}
                  inputProps={inputProps}
                  saveAsNumber={saveAsNumber}
                  inputComponent={InputComponent}
                />
                {addons}
              </CustomInputGroup>
            )}
            {errorPosition === "after-input" && invalid && (
              <FieldError errors={[error]} />
            )}
          </CustomField>
        )
      }
    />
  );
}

const FormInputAdapter = <
  T extends FieldValues,
  ExtendedInputComponentProps extends InputComponentProps,
>({
  id,
  field: { onChange, ...field },
  invalid,
  className,
  inputProps,
  saveAsNumber,
  inputComponent: InputComponent,
}: {
  id: string;
  field: ControllerRenderProps<FieldValues, Path<T>>;
  invalid: boolean;
  className?: string;
  inputProps: ExtendedInputComponentProps;
  saveAsNumber: boolean;
  inputComponent: FC<ExtendedInputComponentProps>;
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
      className={className}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        onChange(
          // TODO make this more readable
          inputProps?.type === "number"
            ? saveAsNumber
              ? isNaN(extractNumberFromInput(e))
                ? 0
                : extractNumberFromInput(e)
              : extractDigitsOnly(e)
            : typeof e === "object"
              ? e.target.value
              : e,
        )
      }
      {...inputProps}
      {...field}
    />
  );
};

// TODO make it type safe
