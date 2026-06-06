-- ============================================================
-- FIX: push_subscriptions RLS policy for upsert operations
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Step 1: Drop the old combined 'for all' policy
drop policy if exists "Users can manage their own subscriptions" on public.push_subscriptions;

-- Step 2: Drop any existing granular policies (safe re-run)
drop policy if exists "Users can read own subscriptions" on public.push_subscriptions;
drop policy if exists "Users can insert own subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update own subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete own subscriptions" on public.push_subscriptions;
drop policy if exists "Service role full access" on public.push_subscriptions;

-- Step 3: Create granular per-operation policies

-- SELECT: Users can only read their own subscriptions
create policy "Users can read own subscriptions"
  on public.push_subscriptions for select
  using (auth.uid()::text = user_id);

-- INSERT: Users can only insert subscriptions for themselves
-- (INSERT only uses WITH CHECK, not USING — this is the core fix)
create policy "Users can insert own subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid()::text = user_id);

-- UPDATE: Users can only update their own subscriptions
create policy "Users can update own subscriptions"
  on public.push_subscriptions for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- DELETE: Users can only delete their own subscriptions
create policy "Users can delete own subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid()::text = user_id);

-- Service role bypass for Edge Functions
create policy "Service role full access"
  on public.push_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

