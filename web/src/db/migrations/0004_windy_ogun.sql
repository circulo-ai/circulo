ALTER TABLE "chat_member" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_member" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_member" ADD COLUMN "pin_order" integer;--> statement-breakpoint
CREATE INDEX "chat_member_user_pinned_idx" ON "chat_member" USING btree ("user_id","is_pinned");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_member_user_pin_order_unique" ON "chat_member" USING btree ("user_id","pin_order");