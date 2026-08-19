import { colorPattern, tailwindColorMap } from "@/consts/hero-section";
import { cn } from "@/lib/utils";
import { ArrowRight, ArrowUpRight, Phone } from "lucide-react";
import { EnhancedLink } from "./enhanced-link";
import { Logo } from "./logo";
import { Button } from "./ui/button";

const starPositions = Array.from({ length: 128 }, (_, index) => ({
  top: `${(index * 47 + 13) % 100}%`,
  left: `${(index * 71 + 29) % 100}%`,
}));

export function HeroSection() {
  return (
    <section id="home" className="main-section flex flex-col">
      <div className="relative mx-8 mb-4 grid grow grid-cols-2 grid-rows-1 overflow-hidden rounded-4xl [clip-path:inset(0_round_var(--radius-4xl))]">
        {/* stars */}
        <div className="absolute inset-0">
          {starPositions.map((position, i) => (
            <div
              key={i}
              className="absolute size-px animate-pulse rounded-full bg-teal-50/50"
              style={{
                top: position.top,
                left: position.left,
                animationDelay: `-${i * 750}ms`,
              }}
            />
          ))}
        </div>

        {/* lines down */}
        <div className="absolute inset-y-0 start-0 end-0 mx-auto flex w-fit gap-8 md:end-1/2">
          {[0, 1, 2, 3, 4].map((line) => (
            <div
              key={line}
              className="relative w-0.5 bg-linear-to-b from-transparent via-transparent to-teal-50/10"
            >
              {line % 2 === 0 && (
                <div
                  className="absolute h-1/6 w-full animate-down bg-linear-to-b from-transparent to-teal-50"
                  style={{ animationDelay: `-${line * 500}ms` }}
                />
              )}
            </div>
          ))}
        </div>

        {/* gradient top right */}
        <div className="absolute end-0 bottom-1/2 grid aspect-square w-1/2 rotate-45 grid-cols-4 grid-rows-4 blur-[128px]">
          {colorPattern.map((color, i) => (
            <div
              key={i}
              className={cn(
                tailwindColorMap[color],
                "animate-pulse animation-duration-[4s]",
              )}
              style={{ animationDelay: `-${i * 750}ms` }}
            />
          ))}
        </div>

        {/* gradient bottom left */}
        <div className="absolute top-3/4 right-3/4 grid aspect-square w-1/4 rotate-45 grid-cols-2 grid-rows-2 blur-[128px]">
          {colorPattern.slice(-4).map((color, i) => (
            <div
              key={i}
              className={cn(
                tailwindColorMap[color],
                "animate-pulse animation-duration-[4s]",
              )}
              style={{ animationDelay: `-${i * 750}ms` }}
            />
          ))}
        </div>

        {/* content start */}
        <main className="relative flex flex-col items-center justify-evenly px-8 max-md:col-span-2">
          <EnhancedLink
            href="https://www.youtube.com/"
            target="_blank"
            buttonProps={{
              variant: "highlightedText",
              size: "wider",
              rounded: "full",
            }}
          >
            <Logo />
            Watch our demo!
            <ArrowRight className="size-3" />
          </EnhancedLink>

          <div className="flex flex-col items-center justify-center gap-4 text-center text-balance">
            <h1 className="text-4xl font-semibold sm:text-5xl lg:text-6xl">
              Many minds, one evolving dialogue
            </h1>
            <h2 className="text-lg">
              A circle of intelligent voices exchanging ideas, debating, and
              co-creating insights through conversation
            </h2>
          </div>

          <div className="flex items-center gap-2 max-sm:flex-col">
            <Button
              asChild
              variant="highlightedText"
              rounded="full"
              size="lg-wider"
            >
              <a href="#contact-us">
                <Phone />
                Contact us
              </a>
            </Button>
            <EnhancedLink
              href="/auth/sign-in"
              buttonProps={{
                variant: "primary",
                rounded: "full",
                size: "lg-widest",
              }}
            >
              Open App <ArrowUpRight />
            </EnhancedLink>
          </div>
        </main>
      </div>
    </section>
  );
}
