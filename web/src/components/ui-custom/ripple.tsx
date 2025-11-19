import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, DetailedHTMLProps, FC } from "react";
import RippleClient from "./ripple-client";

interface RippleProps
  extends DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  customProp?: string;
}

const Ripple: FC<RippleProps> = ({
  className,
  children,
  disabled: disabledProp,
  ...otherProps
}) => {
  const id = Math.random().toString();

  return (
    <button
      id={id}
      disabled
      className={cn(
        "relative touch-none overflow-hidden select-none",
        className,
      )}
      {...otherProps}
    >
      {children}
      <RippleClient id={id} disabled={disabledProp} />
    </button>
  );
};

export default Ripple;
