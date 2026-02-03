import { navItems } from "@/consts/nav";
import { getSession } from "@/lib/auth";
import { UserButton } from "@daveyplate/better-auth-ui";
import { ArrowUpRight, Phone, User } from "lucide-react";
import { Suspense, useId } from "react";
import { EnhancedLink } from "./enhanced-link";
import { EnhancedLinkSpinner } from "./enhanced-link-spinner";
import GradualBlur from "./gradual-blur";
import { Logo } from "./logo";
import { NavDrawer } from "./nav-drawer";
import { NavUlDot } from "./nav-ul-dot";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

export function Nav() {
  const ulId = useId();

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

      <div className="flex w-48 items-center gap-2">
        <Logo className="max-sm:h-6" />
        <h1 className="text-2xl text-teal-50 sm:text-4xl">Circulo</h1>
      </div>

      <ul
        id={ulId}
        className="flex items-center gap-4 rounded-full border-2 border-teal-50/5 bg-teal-50/5 p-2 ps-4 max-md:hidden"
      >
        {navItems.map(
          (navItem) =>
            navItem.hidden !== true && (
              <li key={navItem.label}>
                <Button
                  asChild
                  variant="text"
                  size="text"
                  className="duration-300 data-active:translate-x-1"
                >
                  <a href={navItem.href}>{navItem.label}</a>
                </Button>
              </li>
            ),
        )}

        <NavUlDot ulId={ulId} />

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
          <Button
            asChild
            variant="primary"
            size="icon-xs"
            rounded="full"
            className="duration-300 data-active:text-foreground"
          >
            <a href="#contact-us">
              <Phone className="relative" />
            </a>
          </Button>
        </li>
      </ul>

      <div className="flex w-48 items-center justify-end">
        <Suspense fallback={<Spinner />}>
          <AuthLink />
        </Suspense>
        <NavDrawer />
      </div>
    </nav>
  );
}

async function AuthLink() {
  const session = await getSession();
  const signedIn = session?.user;

  if (signedIn) return <UserButton variant="ghost" />;

  return (
    <EnhancedLink
      href="/auth/sign-in"
      buttonProps={{ variant: "text", size: "text" }}
    >
      <User className="size-5" />
      Sign in
      <EnhancedLinkSpinner />
    </EnhancedLink>
  );
}
