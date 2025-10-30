import { Button } from "./ui/button";

export function FaqSection() {
  return (
    <section
      id="faq"
      className="main-section grid grid-cols-3 grid-rows-1 gap-8 px-8 py-4"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center text-balance">
        <h3 className="text-4xl font-semibold">Frequently asked questions</h3>
        <p className="text-lg">
          These are the most commonly asked questions about Circulo. Can't find
          what you're looking for?{" "}
          <Button asChild variant="link" size="text" className="text-lg">
            <a href="#contact-us">Chat to our friendly team!</a>
          </Button>
        </p>
      </div>

      <div className="col-span-2"></div>
    </section>
  );
}
