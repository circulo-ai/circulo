"use client";

import { faqs } from "@/consts/faq-section";
import { useFaq } from "@/providers/faq-provider";
import { ComponentProps, useEffect, useMemo, useRef } from "react";
import { CustomAccordionTrigger } from "./ui-custom/accordion";
import { Accordion, AccordionContent, AccordionItem } from "./ui/accordion";
import { AnimatedItem, AnimatedList } from "./ui/animated-list";
import { IconBox } from "./ui/icon-box";
import { ScrollArea } from "./ui/scroll-area";

export function FaqList(props: ComponentProps<typeof ScrollArea>) {
  const [{ selectedTag }] = useFaq();
  const filteredFaqs = useMemo(
    () => faqs.filter((faq) => faq.tags.includes(selectedTag)),
    [selectedTag],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedTag]);

  return (
    <ScrollArea viewportRef={viewportRef} {...props}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-linear-to-b from-background to-transparent" />
      <AnimatedList asChild>
        <Accordion
          type="single"
          collapsible={true}
          className="my-16"
          defaultValue={faqs[0].index.toString()}
        >
          <AnimatedItem asChild>
            {filteredFaqs.map((faq) => (
              <AccordionItem
                className="pr-4"
                value={faq.index.toString()}
                key={faq.index}
              >
                <CustomAccordionTrigger className="items-center underline-offset-6">
                  <IconBox icon={faq.icon} />
                  <h4 className="font-semibold">{faq.question}</h4>
                </CustomAccordionTrigger>
                <AccordionContent>
                  <p className="ms-13 text-foreground/75">{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </AnimatedItem>
        </Accordion>
      </AnimatedList>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background to-transparent" />
      {/* needs CustomScrollBar with z-10? */}
    </ScrollArea>
  );
}

// TODO fix style
