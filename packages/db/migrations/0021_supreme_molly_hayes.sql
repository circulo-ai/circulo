ALTER TABLE "chats" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "chats_org_archived_idx" ON "chats" USING btree ("organization_id","is_archived");