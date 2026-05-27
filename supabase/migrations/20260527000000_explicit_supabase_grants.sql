-- Migration: Explicit Supabase Data API Grants
-- Description: Sets up default privileges and explicit table-level grants on the public schema 
-- to comply with the Supabase May 30, 2026 security change. This ensures PostgREST and the 
-- supabase-js client can interact with all tables.

-- 1. Configure Default Privileges for all FUTURE tables and sequences in the public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- 2. Explicitly grant access to all EXISTING tables in the public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', r.tablename);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', r.tablename);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', r.tablename);
    END LOOP;
END $$;

-- 3. Explicitly grant access to all EXISTING sequences in the public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO anon', r.sequencename);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', r.sequencename);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', r.sequencename);
    END LOOP;
END $$;
