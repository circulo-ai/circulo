CREATE TABLE "quota_buckets" (
	"organization_id" text NOT NULL,
	"feature" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"limit" integer,
	"reserved" integer DEFAULT 0 NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_buckets_organization_id_feature_period_start_pk" PRIMARY KEY("organization_id","feature","period_start")
);
--> statement-breakpoint
CREATE TABLE "quota_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"feature" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"incoming_device_id" text NOT NULL,
	"incoming_idempotency_key" text NOT NULL,
	"incoming_payload" jsonb NOT NULL,
	"winning_payload" jsonb NOT NULL,
	"resolution" text DEFAULT 'latest-write-wins' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jti" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_device_tokens_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE "sync_pairing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_pairing_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "quota_buckets" ADD CONSTRAINT "quota_buckets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quota_reservations" ADD CONSTRAINT "quota_reservations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quota_reservations" ADD CONSTRAINT "quota_reservations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_device_tokens" ADD CONSTRAINT "sync_device_tokens_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_device_tokens" ADD CONSTRAINT "sync_device_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_pairing_sessions" ADD CONSTRAINT "sync_pairing_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_pairing_sessions" ADD CONSTRAINT "sync_pairing_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "quota_reservations_idempotency_idx" ON "quota_reservations" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "sync_conflicts_org_created_idx" ON "sync_conflicts" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "sync_conflicts_incoming_idx" ON "sync_conflicts" USING btree ("organization_id","incoming_idempotency_key");
--> statement-breakpoint
CREATE INDEX "sync_device_tokens_org_idx" ON "sync_device_tokens" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "sync_device_tokens_device_idx" ON "sync_device_tokens" USING btree ("device_id");
--> statement-breakpoint
CREATE INDEX "sync_pairing_sessions_org_idx" ON "sync_pairing_sessions" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "sync_pairing_sessions_expires_idx" ON "sync_pairing_sessions" USING btree ("expires_at");
