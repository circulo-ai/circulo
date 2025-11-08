"use client";

import {
  ComponentProps,
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";

interface Pointer {
  position: { x: number; y: number };
}

type PointerContext = [Pointer, Dispatch<SetStateAction<Pointer>>];

const defaultContext: PointerContext = [{ position: { x: 0, y: 0 } }, () => {}];

const PointerContext = createContext<PointerContext>(defaultContext);

export function PointerProvider({
  children,
}: Pick<ComponentProps<"div">, "children">) {
  const [state, setState] = useState<Pointer>(defaultContext[0]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) =>
      setState((prev) => ({
        ...prev,
        position: { x: event.clientX, y: event.clientY },
      }));

    window.addEventListener("pointermove", handlePointerMove);

    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <PointerContext.Provider value={[state, setState]}>
      {children}
    </PointerContext.Provider>
  );
}

export function usePointer() {
  return useContext(PointerContext);
}
