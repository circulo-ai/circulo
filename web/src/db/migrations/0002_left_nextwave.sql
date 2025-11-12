ALTER TABLE "chat" ALTER COLUMN "visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "visibility" SET DEFAULT 'private'::text;--> statement-breakpoint
DROP TYPE "public"."chat_visibility";--> statement-breakpoint
CREATE TYPE "public"."chat_visibility" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "visibility" SET DEFAULT 'private'::"public"."chat_visibility";--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "visibility" SET DATA TYPE "public"."chat_visibility" USING "visibility"::"public"."chat_visibility";