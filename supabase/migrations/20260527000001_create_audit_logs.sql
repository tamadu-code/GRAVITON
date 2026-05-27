-- Migration: Create Audit Logs Table
-- Description: Creates the public.audit_logs table to support the compliance audit trails,
-- enables RLS, and sets up explicit grants.

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(50) NOT NULL,
    "table" VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_id VARCHAR(255),
    details TEXT
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for audit_logs
CREATE POLICY "Enable read access for authenticated users" ON public.audit_logs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- Explicit grants
GRANT SELECT, INSERT ON TABLE public.audit_logs TO anon, authenticated, service_role;
