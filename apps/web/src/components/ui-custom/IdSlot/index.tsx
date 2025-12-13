"use client";

import { Slot, SlotProps } from "@radix-ui/react-slot";
import { createContext, forwardRef, useContext, useId, useMemo } from "react";

type IdType = SlotProps["id"];

const IdSlotContext = createContext<IdType>(undefined);

const IdSlot = forwardRef<HTMLElement, SlotProps>(function IdSlot(
  { id: providedId, ...restProps },
  ref,
) {
  const contextId = useContext(IdSlotContext); // TODO bug?
  const generatedId = useId();
  const stableId = useMemo(
    () => providedId ?? contextId ?? generatedId,
    [providedId, contextId, generatedId],
  );
  return (
    <IdSlotContext.Provider value={stableId}>
      <Slot id={stableId} {...restProps} ref={ref} />
    </IdSlotContext.Provider>
  );
});

function useIdSlot() {
  const providedId = useContext(IdSlotContext);
  if (!providedId)
    throw new Error("useRequiredIdSlot must be used within an IdSlot.");
  return providedId;
}

export { IdSlot, useIdSlot };
