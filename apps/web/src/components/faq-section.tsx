import { FaqProvider } from "@/providers/faq-provider";
import { FaqBackground } from "./faq-background";
import { FaqList } from "./faq-list";
import { FaqTags } from "./faq-tags";
import { Button } from "./ui/button";

export function FaqSection() {
  return (
    <FaqProvider>
      <section
        id="faq"
        className="main-section relative grid grid-cols-5 gap-8 px-8 py-4 sm:grid-rows-1"
      >
        <FaqBackground />

        <div className="col-span-full flex flex-col items-center justify-center gap-4 text-center text-balance sm:col-span-2">
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

        <FaqList className="col-span-full sm:col-span-3" />
      </section>
    </FaqProvider>
  );
}
