ALTER TABLE "user" ADD COLUMN "username" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_unique" ON "user" USING btree ("username");
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "orchestration_agent_id" uuid;
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "orchestration_model" text DEFAULT 'openai/gpt-4o-mini' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "orchestration_fallback_model" text DEFAULT 'openai/gpt-4o-mini' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_orchestration_agent_id_agents_id_fk" FOREIGN KEY ("orchestration_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
