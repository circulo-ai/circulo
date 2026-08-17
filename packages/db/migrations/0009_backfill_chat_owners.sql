INSERT INTO "chat_members" (
  "id",
  "chat_id",
  "user_id",
  "role",
  "can_invite",
  "can_manage_agents",
  "can_manage_knowledge"
)
SELECT
  gen_random_uuid(),
  c."id",
  c."creator_id",
  'owner',
  true,
  true,
  true
FROM "chats" c
ON CONFLICT ("chat_id", "user_id") DO NOTHING;
