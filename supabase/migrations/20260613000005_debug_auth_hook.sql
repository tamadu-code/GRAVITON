-- Migration: Create hook_debug table and modify custom_access_token_hook to log debug info

CREATE TABLE IF NOT EXISTS public.hook_debug (
    id bigint generated always as identity primary key,
    created_at timestamp with time zone default now() not null,
    event jsonb,
    raw_user_id text,
    resolved_user_id text,
    user_tenant_id uuid,
    user_role text,
    error_message text
);

-- Grant permissions to supabase_auth_admin so it can insert debug logs
GRANT INSERT, SELECT ON TABLE public.hook_debug TO supabase_auth_admin;
GRANT USAGE, SELECT ON SEQUENCE public.hook_debug_id_seq TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims jsonb;
    user_tenant_id uuid;
    user_role text;
    raw_user_id text;
    err_msg text;
BEGIN
    -- 1. Safety check
    IF event IS NULL OR event->'claims' IS NULL THEN
        RETURN event;
    END IF;

    claims := event->'claims';
    raw_user_id := event->>'user_id';

    -- Fallback to nested user id if top-level is null
    IF raw_user_id IS NULL AND event->'user' IS NOT NULL THEN
        raw_user_id := event->'user'->>'id';
    END IF;

    -- 2. Query profiles only if raw_user_id is a valid UUID
    IF raw_user_id IS NOT NULL AND raw_user_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        BEGIN
            SELECT p.tenant_id, p.role INTO user_tenant_id, user_role
            FROM public.profiles p
            WHERE p.id = raw_user_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            err_msg := SQLERRM;
            user_tenant_id := NULL;
            user_role := NULL;
        END;
    END IF;

    -- Log debug details (run in a sub-block to prevent logging failures from breaking auth)
    BEGIN
        -- Insert debug record (temporary to diagnose hook behavior)
        -- Note: using a separate function or direct insert since we have permissions
        INSERT INTO public.hook_debug (event, raw_user_id, resolved_user_id, user_tenant_id, user_role, error_message)
        VALUES (event, event->>'user_id', raw_user_id, user_tenant_id, user_role, err_msg);
    EXCEPTION WHEN OTHERS THEN
        -- Bypassed
    END;

    -- 3. Set the claims
    IF user_tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
    END IF;

    IF user_role IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    ELSE
        claims := jsonb_set(claims, '{user_role}', '"Student"');
    END IF;

    -- 4. Update the event with the modified claims
    event := jsonb_set(event, '{claims}', claims);

    RETURN event;
EXCEPTION WHEN OTHERS THEN
    RETURN event;
END;
$$;
