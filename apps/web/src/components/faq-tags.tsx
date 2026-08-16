"use client";

import { tags } from "@/consts/faq-section";
import { useFaq } from "@/providers/faq-provider";
import { Button } from "./ui/button";

export function FaqTags() {
  const [{ selectedTag }, setFaq] = useFaq();

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {tags.map((tag) => (
        <Button
          variant={tag === selectedTag ? "primary" : "secondary"}
          key={tag}
          rounded="full"
          onClick={() => setFaq({ selectedTag: tag })}
        >
          {tag}
        </Button>
      ))}
    </div>
  );
}
