ALTER TABLE "agents" ALTER COLUMN "model" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "model" SET DEFAULT 'openai/gpt-4o-mini';--> statement-breakpoint
DROP TYPE "public"."llm_model";