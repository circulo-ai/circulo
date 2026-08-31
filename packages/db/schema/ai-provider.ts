import { aiProviderIdSchema, type AiProviderId } from "@circulo-ai/types";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** User-owned provider credentials. The API key is never selected for API responses. */
export const aiProviderCredential = pgTable(
  "ai_provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").$type<AiProviderId>().notNull(),
    name: text("name").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    baseUrl: text("base_url"),
    enabled: boolean("enabled").notNull().default(true),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_provider_credentials_user_idx").on(table.userId),
    uniqueIndex("ai_provider_credentials_user_provider_idx").on(
      table.userId,
      table.providerId,
    ),
  ],
);

export type AiProviderCredential = typeof aiProviderCredential.$inferSelect;
export type NewAiProviderCredential = typeof aiProviderCredential.$inferInsert;

export function isAiProviderId(value: string): value is AiProviderId {
  return aiProviderIdSchema.safeParse(value).success;
}
