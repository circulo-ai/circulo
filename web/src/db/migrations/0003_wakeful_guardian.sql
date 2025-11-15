DROP INDEX "usage_user_metric_period_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "usage_user_metric_period_idx" ON "usage_metrics" USING btree ("user_id","metric","period_start");