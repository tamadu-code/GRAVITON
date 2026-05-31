-- Migration: Create push_subscriptions table and grant security roles
-- Description: Create table for PWA web push notifications and setup grants for PostgREST + Edge Functions

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS
alter table public.push_subscriptions enable row level security;

-- Policy to allow users to manage their own subscriptions
create policy "Users can manage their own subscriptions" 
  on public.push_subscriptions for all 
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Explicitly grant permissions to anon, authenticated, and service_role (May 30, 2026 security change compliance)
grant select on public.push_subscriptions to anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- Grant usage on sequences
grant usage, select on all sequences in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;
