import { cn } from "@/lib/utils";
import { FaqProvider } from "@/providers/faq-provider";
import { FaqList } from "./faq-list";
import { FaqTags } from "./faq-tags";
import { Button } from "./ui/button";

export function FaqSection() {
  return (
    <FaqProvider>
      <section
        id="faq"
        className="main-section relative grid grid-cols-3 grid-rows-1 gap-8 px-8 py-4"
      >
        <div className="absolute -start-1/3 end-2/3 -z-10 grid h-full grid-cols-8 grid-rows-8 divide-x-2 divide-y-2 divide-teal-50/10 divide-x-reverse">
          {Array.from({ length: 8 * 8 }, (_, i) => (
            <div key={i} className={cn(i > 56 && "border-b-0")} />
          ))}
          <div className="to-background absolute size-full bg-radial from-transparent" />
        </div>

        <div className="flex flex-col items-center justify-center gap-4 text-center text-balance">
          <h3 className="text-4xl font-semibold">Frequently asked questions</h3>
          <p className="text-lg">
            These are the most commonly asked questions about Circulo. Can't
            find what you're looking for?{" "}
            <Button asChild variant="link" size="text" className="text-lg">
              <a href="#contact-us">Chat to our friendly team!</a>
            </Button>
          </p>
          <FaqTags />
        </div>

        <FaqList className="col-span-2" />
      </section>
    </FaqProvider>
  );
}
