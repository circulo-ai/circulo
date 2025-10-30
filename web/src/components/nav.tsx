import { navItems } from "@/consts/nav";
import { ArrowUpRight, Phone, User } from "lucide-react";
import { EnhancedLink } from "./enhanced-link";
import GradualBlur from "./gradual-blur";
import { Logo } from "./logo";
import { Button } from "./ui/button";

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex h-20 items-center justify-between px-8 py-4">
      <GradualBlur
        zIndex={-1}
        position="top"
        height="5rem"
        curve="bezier"
        responsive={true}
        exponential={true}
      />

      <div className="flex items-center gap-2">
        <Logo />
        <h1 className="text-4xl text-teal-50">Circulo</h1>
      </div>

      <ul className="fixed inset-x-0 mx-auto flex w-fit items-center gap-4 rounded-full border-2 border-teal-50/5 bg-teal-50/5 p-2 ps-4">
        {navItems.map((navItem) => (
          <li key={navItem.label}>
            <Button asChild variant="text" size="text">
              <a href={navItem.href}>{navItem.label}</a>
            </Button>
          </li>
        ))}

        <li className="ms-8">
          <EnhancedLink
            href="/docs"
            buttonProps={{
              variant: "highlightedText",
              size: "wide",
              rounded: "full",
            }}
          >
            Docs <ArrowUpRight className="size-3" />
          </EnhancedLink>
        </li>

        <li className="-ms-2">
          <Button asChild variant="primary" size="icon-xs" rounded="full">
            <a href="#contact-us">
              <Phone />
            </a>
          </Button>
        </li>
      </ul>

      <EnhancedLink
        href="/auth/sign-in"
        buttonProps={{ variant: "text", size: "text" }}
      >
        <User className="size-5" />
        Sign in
      </EnhancedLink>
    </nav>
  );
}
