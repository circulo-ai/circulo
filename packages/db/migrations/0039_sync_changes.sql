CREATE TABLE "sync_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text,
  "actor_user_id" text,
  "device_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "operation" text NOT NULL,
  "payload" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "client_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE
);
--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sync_changes_org_created_idx" ON "sync_changes" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "sync_changes_entity_idx" ON "sync_changes" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION circulo_capture_sync_change() RETURNS trigger AS $$
DECLARE
  row_data jsonb;
  operation_name text;
  entity_id_value text;
  organization_id_value text;
  actor_user_id_value text;
  origin_device_id text;
  updated_at_value timestamptz;
BEGIN
  IF current_setting('circulo.sync_suppress', true) = 'true' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  operation_name := lower(TG_OP);
  entity_id_value := row_data->>'id';
  organization_id_value := row_data->>'organization_id';
  actor_user_id_value := COALESCE(row_data->>'user_id', row_data->>'created_by');
  origin_device_id := COALESCE(NULLIF(current_setting('circulo.sync_origin', true), ''), 'server');
  updated_at_value := COALESCE((row_data->>'updated_at')::timestamptz, now());

  INSERT INTO sync_changes (
    organization_id,
    actor_user_id,
    device_id,
    entity_type,
    entity_id,
    operation,
    payload,
    client_updated_at,
    idempotency_key
  ) VALUES (
    organization_id_value,
    actor_user_id_value,
    origin_device_id,
    TG_ARGV[0],
    entity_id_value,
    operation_name,
    row_data,
    updated_at_value,
    md5(TG_ARGV[0] || ':' || entity_id_value || ':' || operation_name || ':' || clock_timestamp()::text)
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS circulo_sync_chats ON chats;
CREATE TRIGGER circulo_sync_chats AFTER INSERT OR UPDATE OR DELETE ON chats FOR EACH ROW EXECUTE FUNCTION circulo_capture_sync_change('chat');
--> statement-breakpoint
DROP TRIGGER IF EXISTS circulo_sync_agents ON agents;
CREATE TRIGGER circulo_sync_agents AFTER INSERT OR UPDATE OR DELETE ON agents FOR EACH ROW EXECUTE FUNCTION circulo_capture_sync_change('agent');
--> statement-breakpoint
DROP TRIGGER IF EXISTS circulo_sync_memories ON memories;
CREATE TRIGGER circulo_sync_memories AFTER INSERT OR UPDATE OR DELETE ON memories FOR EACH ROW EXECUTE FUNCTION circulo_capture_sync_change('memory');
--> statement-breakpoint
DROP TRIGGER IF EXISTS circulo_sync_artifacts ON artifacts;
CREATE TRIGGER circulo_sync_artifacts AFTER INSERT OR UPDATE OR DELETE ON artifacts FOR EACH ROW EXECUTE FUNCTION circulo_capture_sync_change('artifact');
