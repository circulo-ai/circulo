"use client";

import type { CustomUIDataTypes } from "@/lib/types";
import type { DataUIPart } from "ai";
import type React from "react";
import { createContext, useContext, useMemo, useState } from "react";

type DataStreamContextValue = {
  dataStream: DataUIPart<CustomUIDataTypes>[];
  setDataStream: React.Dispatch<
    React.SetStateAction<DataUIPart<CustomUIDataTypes>[]>
  >;
};

const DataStreamContext = createContext<DataStreamContextValue | null>(null);
const DataStreamActionsContext = createContext<React.Dispatch<
  React.SetStateAction<DataUIPart<CustomUIDataTypes>[]>
> | null>(null);

export function DataStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dataStream, setDataStream] = useState<DataUIPart<CustomUIDataTypes>[]>(
    [],
  );

  const value = useMemo(() => ({ dataStream, setDataStream }), [dataStream]);

  return (
    <DataStreamActionsContext.Provider value={setDataStream}>
      <DataStreamContext.Provider value={value}>
        {children}
      </DataStreamContext.Provider>
    </DataStreamActionsContext.Provider>
  );
}

export function useDataStream() {
  const context = useContext(DataStreamContext);
  if (!context) {
    throw new Error("useDataStream must be used within a DataStreamProvider");
  }
  return context;
}

export function useDataStreamActions() {
  const setDataStream = useContext(DataStreamActionsContext);
  if (!setDataStream) {
    throw new Error(
      "useDataStreamActions must be used within a DataStreamProvider",
    );
  }
  return setDataStream;
}
