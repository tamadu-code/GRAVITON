-- Migration: Pricing Plans and Super Admin Support
-- Description: Creates the plans table, seeds default plans, and sets up RLS.

CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    student_limit INTEGER NOT NULL DEFAULT 100,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plans if they don't exist
INSERT INTO public.plans (name, price, student_limit, features)
VALUES 
    ('Free Trial', 0.00, 200, '{"sms": true, "cbt": true, "push_notifications": true}'::jsonb),
    ('Standard Plan', 49.99, 500, '{"sms": true, "cbt": true, "push_notifications": true}'::jsonb),
    ('Premium Plan', 99.99, 1000, '{"sms": true, "cbt": true, "push_notifications": true, "advanced_analytics": true}'::jsonb),
    ('Custom Enterprise', 249.99, 99999, '{"sms": true, "cbt": true, "push_notifications": true, "advanced_analytics": true, "dedicated_support": true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users (to view active plan options)
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.plans;
CREATE POLICY "Allow read access to authenticated users" 
ON public.plans FOR SELECT TO authenticated USING (true);

-- Allow full access to SuperAdmin role only
DROP POLICY IF EXISTS "Allow full management to SuperAdmin" ON public.plans;
CREATE POLICY "Allow full management to SuperAdmin" 
ON public.plans FOR ALL TO authenticated 
USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin')
WITH CHECK ((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role') = 'SuperAdmin');

-- Allow service_role bypass
DROP POLICY IF EXISTS "Allow service_role bypass" ON public.plans;
CREATE POLICY "Allow service_role bypass" 
ON public.plans FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Explicit Grants
GRANT SELECT ON TABLE public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plans TO service_role;
