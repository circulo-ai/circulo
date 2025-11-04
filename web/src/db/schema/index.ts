import { customType } from "drizzle-orm/pg-core";

export * from "./agent";
export * from "./audit";
export * from "./auth";
export * from "./billing";
export * from "./chat";
export * from "./knowledge";
export * from "./relations";

export const tsvector = customType<{ data: string }>({
  dataType() {
    return `tsvector`;
  },
});
