-- Migration: Deduplicate subscriptions and add UNIQUE constraint on tenant_id
-- Problem: The subscriptions table had no unique constraint on tenant_id.
-- The seed migration + SuperAdmin updates could create multiple rows per tenant.
-- When PostgREST's .maybeSingle() finds >1 row, it returns PGRST116 error
-- with data: null, causing the client to silently fall back to defaults (standard/200).

-- STEP 1: Delete duplicate subscription rows, keeping only the most recently updated one per tenant
DELETE FROM public.subscriptions
WHERE id NOT IN (
    SELECT DISTINCT ON (tenant_id) id
    FROM public.subscriptions
    ORDER BY tenant_id, updated_at DESC
);

-- STEP 2: Add a unique constraint on tenant_id to prevent future duplicates
-- The SuperAdmin's editTenantSubscription() upsert logic already uses sub.id when it exists,
-- but this constraint guarantees only 1 subscription row per tenant at the DB level.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenant_id_unique'
    ) THEN
        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tenant_id_unique UNIQUE (tenant_id);
    END IF;
END $$;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
