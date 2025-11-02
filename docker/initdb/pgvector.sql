-- This file runs automatically when the postgres container is first created
-- It runs as the postgres superuser, so it has permission to create extensions

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable other useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant necessary permissions to the postgres user
GRANT ALL PRIVILEGES ON DATABASE app TO postgres;

-- Output confirmation
DO $$
BEGIN
    RAISE NOTICE 'Extensions initialized successfully';
    RAISE NOTICE 'pgvector version: %', (SELECT extversion FROM pg_extension WHERE extname = 'vector');
END $$;
