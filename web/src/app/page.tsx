import { HeroScene } from "@/components/three-d";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
];

const mapColors = [1, 1, 1, 2, 2, 3, 0, 0, 1, 1, 1, 2, 2, 3, 0, 0];

const twColors: Record<number, string> = {
  0: "bg-sky-500",
  1: "bg-sky-300",
  2: "bg-emerald-500",
  3: "bg-emerald-100",
};

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-black">
      <nav className="flex items-center justify-between px-8 py-4">
        <div>LOGO</div>

        <ul className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 p-2">
          {navItems.map((navItem) => (
            <li key={navItem.name} className="px-2 py-1 text-sm">
              {navItem.name}
            </li>
          ))}

          <li className="ms-8">Protection</li>
          <li>ICON</li>
        </ul>

        <div>Create Account</div>
      </nav>

      <main className="relative mx-8 mb-4 flex grow items-center justify-center overflow-hidden rounded-4xl bg-neutral-950">
        {/* stars */}
        <div className="absolute inset-0">
          {Array.from({ length: 100 })
            .fill(null)
            .map((_, i) => (
              <div
                key={i}
                className="absolute aspect-square w-px animate-pulse rounded-full bg-white/50"
                style={{
                  top: Math.random() * 100 + "%",
                  left: Math.random() * 100 + "%",
                  animationDelay: `-${i * 750}ms`,
                }}
              />
            ))}
        </div>

        {/* lines down */}
        <div className="absolute inset-0 mx-auto flex w-fit gap-8">
          {[0, 1, 2, 3, 4].map((line) => (
            <div
              key={line}
              className="relative h-full w-1 bg-linear-to-b from-transparent via-transparent to-white/10"
            >
              {line % 2 === 0 && (
                <div
                  className="animate-down absolute h-1/6 w-full bg-linear-to-b from-transparent to-white"
                  style={{ animationDelay: `-${line * 500}ms` }}
                />
              )}
            </div>
          ))}
        </div>

        {/* gradient top right */}
        <div className="absolute end-0 bottom-1/2 grid aspect-square w-1/2 rotate-45 grid-cols-4 grid-rows-4 blur-[128px]">
          {mapColors.map((color, i) => (
            <div
              key={i}
              className={cn(twColors[color], "animate-pulse")}
              style={{ animationDelay: `-${i * 750}ms` }}
            />
          ))}
        </div>

        {/* gradient bottom left */}
        <div className="absolute top-3/4 right-3/4 grid aspect-square w-1/4 rotate-45 grid-cols-2 grid-rows-2 opacity-50 blur-[128px]">
          {mapColors.slice(4).map((color, i) => (
            <div
              key={i}
              className={cn(twColors[color], "animate-pulse")}
              style={{ animationDelay: `-${i * 750}ms` }}
            />
          ))}
        </div>

        {/* three d */}
        <div className="absolute inset-0 flex w-full items-center justify-between gap-4">
          <HeroScene />
        </div>

        {/* content */}
        <div className="relative flex h-full flex-col items-center justify-evenly">
          <div>{">"}</div>
          <div>Unlock your butt here</div>
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-3xl">My Game Title Here</h1>
            <h2 className="text-sm">
              Do the description thing here better next time please.
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div>Open up</div>
            <div>Discover more</div>
          </div>
          <div />
        </div>
      </main>
    </div>
  );
}
