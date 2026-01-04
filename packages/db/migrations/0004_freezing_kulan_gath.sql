CREATE TYPE "public"."llm_model" AS ENUM('gemini-2.5-flash');--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "model" SET DEFAULT 'gemini-2.5-flash'::"public"."llm_model";--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "model" SET DATA TYPE "public"."llm_model" USING "model"::"public"."llm_model";