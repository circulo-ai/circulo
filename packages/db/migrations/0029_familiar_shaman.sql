ALTER TABLE "mcp_tools" ALTER COLUMN "enabled" SET DEFAULT true;
UPDATE "mcp_tools" SET "enabled" = true WHERE "enabled" = false;
