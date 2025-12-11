"use client";

import { useFormContext } from "react-hook-form";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

interface SubmitProps extends React.ComponentProps<typeof Button> {}

export function Submit({ disabled, children, ...props }: SubmitProps) {
  const {
    formState: { isSubmitting },
  } = useFormContext();

  return (
    <Button type="submit" disabled={disabled ?? isSubmitting} {...props}>
      {isSubmitting && <Spinner />}
      {children}
    </Button>
  );
}

// TODO check if isSubmitting works
