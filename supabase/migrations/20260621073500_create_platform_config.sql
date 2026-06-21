-- Migration: Create platform_config table for global payment settings
-- Description: Stores SuperAdmin-managed platform-wide config like OPay bank details
-- and Paystack public key. Readable by all authenticated users, writable by SuperAdmin only.

CREATE TABLE IF NOT EXISTS public.platform_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO public.platform_config (key, value) VALUES
    ('opay_bank_name', 'OPay (Digital Wallet / Bank)'),
    ('opay_account_number', ''),
    ('opay_account_name', ''),
    ('paystack_public_key', '')
ON CONFLICT (key) DO NOTHING;

-- RLS: All authenticated users can read (tenants need bank details + paystack key)
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_config_read" ON public.platform_config;
CREATE POLICY "platform_config_read" ON public.platform_config
    FOR SELECT TO authenticated USING (true);

-- Only SuperAdmin can write
DROP POLICY IF EXISTS "platform_config_manage" ON public.platform_config;
CREATE POLICY "platform_config_manage" ON public.platform_config
    FOR ALL TO authenticated
    USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin')
    WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin');

-- Service role bypass
DROP POLICY IF EXISTS "platform_config_service" ON public.platform_config;
CREATE POLICY "platform_config_service" ON public.platform_config
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT ON TABLE public.platform_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_config TO service_role;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
