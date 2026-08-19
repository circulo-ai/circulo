ALTER TABLE "apikey" ALTER COLUMN "reference_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;