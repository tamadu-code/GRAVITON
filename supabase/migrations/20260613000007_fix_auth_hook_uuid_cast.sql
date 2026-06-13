-- Migration: Fix profiles ID type mismatch in custom_access_token_hook
-- Description: Changes where clause from p.id = raw_user_id::uuid to p.id = raw_user_id because profiles.id is defined as TEXT.
-- Re-declares function as STABLE for performance (removes debug logging inserts).

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    claims jsonb;
    user_tenant_id uuid;
    user_role text;
    raw_user_id text;
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

    -- 2. Query profiles using text comparison (profiles.id is TEXT)
    IF raw_user_id IS NOT NULL THEN
        BEGIN
            SELECT p.tenant_id, p.role INTO user_tenant_id, user_role
            FROM public.profiles p
            WHERE p.id = raw_user_id;
        EXCEPTION WHEN OTHERS THEN
            user_tenant_id := NULL;
            user_role := NULL;
        END;
    END IF;

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

-- Drop the temporary debug table and functions to keep production clean
DROP FUNCTION IF EXISTS public.get_hook_debug();
DROP TABLE IF EXISTS public.hook_debug;
