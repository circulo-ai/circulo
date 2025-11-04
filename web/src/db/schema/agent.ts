// Templates that creators publish - the "original" agents
import {
  boolean, check,
  decimal,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp, unique
} from "drizzle-orm/pg-core";
import { user } from "@/db/schema/auth";
import { sql } from "drizzle-orm";

export const agentVisibilityEnum = pgEnum("agent_visibility", [
  "private",
  "public",
  "marketplace",
]);
export const agentTemplateStatusEnum = pgEnum("agent_template_status", [
  "draft",
  "published",
  "archived",
]);
export const agentPurchaseStatusEnum = pgEnum("agent_purchase_status", [
  "pending",
  "completed",
  "refunded",
  "disputed",
]);

export const agentTemplate = pgTable(
  "agent_template",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),
    longDescription: text("long_description"), // Markdown description for marketplace
    systemPrompt: text("system_prompt").notNull(),

    // Model configuration (defaults for instances)
    model: text("model").notNull().default("gpt-4"),
    temperature: numeric("temperature", {
      precision: 3,
      scale: 2,
    })
      .notNull()
      .default("0.7"),
    maxTokens: integer("max_tokens").default(2000),

    // Visual identity
    avatar: text("avatar"),
    color: text("color").default("#3B82F6"),
    tags: jsonb("tags").$type<string[]>().default([]),

    // Tools configuration
    tools: jsonb("tools").default("[]"),

    // Template status and visibility
    status: agentTemplateStatusEnum("status").notNull().default("draft"),
    visibility: agentVisibilityEnum("visibility").notNull().default("private"),

    // Marketplace info
    isMarketplace: boolean("is_marketplace").notNull().default(false),
    price: decimal("price", { precision: 10, scale: 2 }).default("0.00"),
    currency: text("currency").default("USD"),

    // Stats
    instanceCount: integer("instance_count").notNull().default(0), // How many agents created from this
    purchaseCount: integer("purchase_count").notNull().default(0),
    totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0.00"),
    rating: numeric("rating", { precision: 3, scale: 2 }).default("0.00"),
    reviewCount: integer("review_count").notNull().default(0),
    usageCount: integer("usage_count").notNull().default(0), // Total messages across all instances

    // SEO & Discovery
    slug: text("slug").unique(),
    featured: boolean("featured").notNull().default(false),

    // Version control
    version: text("version").notNull().default("1.0.0"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
    publishedAt: timestamp("published_at"),
  },
  (table) => ({
    creatorIdIdx: index("agent_template_creator_id_idx").on(table.creatorId),
    statusIdx: index("agent_template_status_idx").on(table.status),
    visibilityIdx: index("agent_template_visibility_idx").on(table.visibility),
    isMarketplaceIdx: index("agent_template_is_marketplace_idx").on(table.isMarketplace),
    featuredIdx: index("agent_template_featured_idx").on(table.featured),
    slugIdx: index("agent_template_slug_idx").on(table.slug),
    marketplaceFeaturedIdx: index("agent_template_marketplace_featured_idx").on(
      table.isMarketplace,
      table.featured,
      table.status
    ),
    createdAtIdx: index("agent_template_created_at_idx").on(table.createdAt),
    priceNonNegative: check("agent_template_price_non_negative", sql`price >= 0`),
    revenueNonNegative: check("agent_template_total_revenue_non_negative", sql`total_revenue >= 0`),
    countsNonNegative: check(
      "agent_template_counts_non_negative",
      sql`instance_count >= 0 AND purchase_count >= 0 AND review_count >= 0 AND usage_count >= 0`
    ),
    ratingRange: check(
      "agent_template_rating_range",
      sql`rating >= 0 AND rating <= 5`
    ),
  }),
);

// Agent instances - users' personalized versions
export const agent = pgTable(
  "agent",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Link to template (nullable for custom agents not from marketplace)
    templateId: text("template_id").references(() => agentTemplate.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),

    // Model configuration (can override template defaults)
    model: text("model").notNull().default("gpt-4"),
    temperature: numeric("temperature", {
      precision: 3,
      scale: 2,
    })
      .notNull()
      .default("0.7"),
    maxTokens: integer("max_tokens").default(2000),

    // Avatar and styling
    avatar: text("avatar"),
    color: text("color").default("#3B82F6"),

    // Tools configuration
    tools: jsonb("tools").default("[]"),

    // Usage stats (for this instance)
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),

    deleted: boolean("deleted").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("agent_user_id_idx").on(table.userId),
    templateIdIdx: index("agent_template_id_idx").on(table.templateId),
    userTemplateIdx: index("agent_user_template_idx").on(
      table.userId,
      table.templateId,
    ),
    usageCountIdx: index("agent_usage_count_idx").on(table.usageCount),
    lastUsedIdx: index("agent_last_used_idx").on(table.lastUsedAt),
    usageCountNonNegative: check("agent_usage_count_non_negative", sql`usage_count >= 0`),
  }),
);

// Agent purchases from marketplace
export const agentPurchase = pgTable(
  "agent_purchase",
  {
    id: text("id").primaryKey(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => agentTemplate.id, { onDelete: "restrict" }),
    agentId: text("agent_id").references(() => agent.id, {
      onDelete: "set null",
    }), // The created agent instance

    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),

    status: agentPurchaseStatusEnum("status").notNull().default("pending"),

    // Revenue split (for creator)
    creatorRevenue: decimal("creator_revenue", { precision: 10, scale: 2 }).notNull(),
    platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),

    refundedAt: timestamp("refunded_at"),
    refundReason: text("refund_reason"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    buyerIdIdx: index("agent_purchase_buyer_id_idx").on(table.buyerId),
    templateIdIdx: index("agent_purchase_template_id_idx").on(table.templateId),
    agentIdIdx: index("agent_purchase_agent_id_idx").on(table.agentId),
    statusIdx: index("agent_purchase_status_idx").on(table.status),
    createdAtIdx: index("agent_purchase_created_at_idx").on(table.createdAt),
    amountNonNegative: check("agent_purchase_amount_non_negative", sql`amount >= 0`),
    revenueFeeNonNegative: check(
      "agent_purchase_revenue_fee_non_negative",
      sql`creator_revenue >= 0 AND platform_fee >= 0`
    ),
  }),
);

// Reviews for marketplace agents
export const agentReview = pgTable(
  "agent_review",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => agentTemplate.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => agentPurchase.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(), // 1-5
    title: text("title"),
    comment: text("comment"),

    helpful: integer("helpful").notNull().default(0), // Helpful votes

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    templateIdIdx: index("agent_review_template_id_idx").on(table.templateId),
    userIdIdx: index("agent_review_user_id_idx").on(table.userId),
    purchaseIdIdx: index("agent_review_purchase_id_idx").on(table.purchaseId),
    uniqueUserTemplateIdx: unique("agent_review_user_template_unique").on(
      table.userId,
      table.templateId,
    ),
    ratingIdx: index("agent_review_rating_idx").on(table.rating),
    createdAtIdx: index("agent_review_created_at_idx").on(table.createdAt),
    ratingRange: check("agent_review_rating_range", sql`rating >= 1 AND rating <= 5`),
    helpfulNonNegative: check("agent_review_helpful_non_negative", sql`helpful >= 0`),
  }),
);

// Agent Template types
export type AgentTemplate = typeof agentTemplate.$inferSelect;
export type NewAgentTemplate = typeof agentTemplate.$inferInsert;
export type AgentVisibility = (typeof agentVisibilityEnum.enumValues)[number];
export type AgentTemplateStatus = (typeof agentTemplateStatusEnum.enumValues)[number];

// Agent types
export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;

// Agent Purchase types
export type AgentPurchase = typeof agentPurchase.$inferSelect;
export type NewAgentPurchase = typeof agentPurchase.$inferInsert;
export type AgentPurchaseStatus = (typeof agentPurchaseStatusEnum.enumValues)[number];

// Agent Review types
export type AgentReview = typeof agentReview.$inferSelect;
export type NewAgentReview = typeof agentReview.$inferInsert;