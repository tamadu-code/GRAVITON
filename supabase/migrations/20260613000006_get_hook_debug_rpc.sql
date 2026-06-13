-- Migration: Create get_hook_debug RPC function to safely query logs

CREATE OR REPLACE FUNCTION public.get_hook_debug()
RETURNS SETOF public.hook_debug
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.hook_debug ORDER BY created_at DESC LIMIT 5;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_hook_debug TO authenticated;
