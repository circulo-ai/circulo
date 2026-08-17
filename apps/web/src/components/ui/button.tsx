import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { type VariantProps } from "class-variance-authority"
import * as React from "react"

import { buttonVariants } from "@/consts/button"
import { cn } from "@/lib/utils"

function Button({
  className,
  variant,
  size,
  rounded,
  children,
  asChild = false,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, rounded, className }))}
      nativeButton={asChild ? false : undefined}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
