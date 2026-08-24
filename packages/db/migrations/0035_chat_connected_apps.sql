ALTER TABLE "chats" ADD COLUMN "connected_app_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
