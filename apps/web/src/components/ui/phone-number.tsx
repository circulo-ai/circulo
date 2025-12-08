import { ComponentProps } from "react";

interface PhoneNumberProps extends Omit<
  ComponentProps<"a">,
  "href" | "children"
> {
  number: string;
}

export function PhoneNumber({ number, ...props }: PhoneNumberProps) {
  return (
    <a href={`tel:${number}`} {...props}>
      {number}
    </a>
  );
}
