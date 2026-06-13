-- Migration: Create register_push_subscription RPC function
-- Description: Allows clients to safely register push subscriptions and handles endpoint conflicts across users.

CREATE OR REPLACE FUNCTION public.register_push_subscription(
    p_user_id text,
    p_endpoint text,
    p_p256dh text,
    p_auth text,
    p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete any existing subscription for this endpoint (regardless of user) to handle device/browser transfers
    DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
    
    -- Insert the new subscription
    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, tenant_id, updated_at)
    VALUES (p_user_id, p_endpoint, p_p256dh, p_auth, p_tenant_id, now());
END;
$$;

-- Grant execute access to authenticated users
GRANT EXECUTE ON FUNCTION public.register_push_subscription TO authenticated;
