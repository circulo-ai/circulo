"use client";

import { Slot } from "@/lib/slot";
import { createContext, forwardRef, useContext, useId, useMemo } from "react";

type IdType = string | undefined;

type IdSlotProps = React.ComponentProps<typeof Slot> & { id?: string };

const IdSlotContext = createContext<IdType>(undefined);

const IdSlot = forwardRef<HTMLElement, IdSlotProps>(function IdSlot(
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
