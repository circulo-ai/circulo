"use client";

import { Tag, tags } from "@/consts/faq-section";
import {
  ComponentProps,
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useState,
} from "react";

interface Faq {
  selectedTag: Tag;
}

type FaqContext = [Faq, Dispatch<SetStateAction<Faq>>];

const defaultValue: FaqContext = [{ selectedTag: tags[0] }, () => {}];

const FaqContext = createContext<FaqContext>(defaultValue);

export function FaqProvider({
  children,
}: Pick<ComponentProps<"div">, "children">) {
  const value = useState<Faq>(defaultValue[0]);

  return <FaqContext.Provider value={value}>{children}</FaqContext.Provider>;
}

export function useFaq() {
  return useContext(FaqContext);
}
