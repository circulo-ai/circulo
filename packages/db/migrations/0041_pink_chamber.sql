CREATE TABLE "instance_auth_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"signup_enabled" boolean DEFAULT false NOT NULL,
	"bootstrap_completed" boolean DEFAULT false NOT NULL,
	"bootstrap_user_id" text,
	"bootstrap_claimed_at" timestamp,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_auth_settings" ADD CONSTRAINT "instance_auth_settings_bootstrap_user_id_user_id_fk" FOREIGN KEY ("bootstrap_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_auth_settings" ADD CONSTRAINT "instance_auth_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;