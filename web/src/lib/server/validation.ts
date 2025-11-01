import { Errors } from "@/lib/server/errors";

export type ValidationSchema<T> = {
  [K in keyof T]: (value: any) => boolean | string;
};

export const validate = <T extends Record<string, any>>(
  data: any,
  schema: ValidationSchema<T>,
): T => {
  const errors: Record<string, string> = {};
  const validated: any = {};

  for (const [key, validator] of Object.entries(schema)) {
    const value = data?.[key];
    const result = validator(value);

    if (result === true) {
      validated[key] = value;
    } else if (typeof result === "string") {
      errors[key] = result;
    } else {
      errors[key] = `Invalid value for ${key}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw Errors.unprocessable("Validation failed", errors);
  }

  return validated as T;
};
