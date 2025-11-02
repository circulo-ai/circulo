-- Create database if it doesn't exist (this is handled by POSTGRES_DB env var)
-- Enable required PostgreSQL extensions

-- pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_trgm for trigram text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extensions are installed
DO $$
BEGIN
    RAISE NOTICE 'Installed extensions:';
    RAISE NOTICE '- vector: %', (SELECT extversion FROM pg_extension WHERE extname = 'vector');
    RAISE NOTICE '- uuid-ossp: %', (SELECT extversion FROM pg_extension WHERE extname = 'uuid-ossp');
    RAISE NOTICE '- pg_trgm: %', (SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm');
END $$;
