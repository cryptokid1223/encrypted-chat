-- =============================================================================
-- Device push tokens (paste into Supabase SQL editor)
-- =============================================================================
-- Stores APNs device tokens per user/device. Server-side push sending is a
-- separate task; this table is written by the iOS client only.
-- =============================================================================

create table if not exists public.device_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

create index if not exists device_tokens_user_id_idx
  on public.device_tokens (user_id);

create index if not exists device_tokens_enabled_idx
  on public.device_tokens (user_id, enabled)
  where enabled = true;

comment on table public.device_tokens is
  'APNs device tokens for content-free push notifications.';

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_select_own" on public.device_tokens;
create policy "device_tokens_select_own"
  on public.device_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "device_tokens_insert_own" on public.device_tokens;
create policy "device_tokens_insert_own"
  on public.device_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "device_tokens_update_own" on public.device_tokens;
create policy "device_tokens_update_own"
  on public.device_tokens
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "device_tokens_delete_own" on public.device_tokens;
create policy "device_tokens_delete_own"
  on public.device_tokens
  for delete
  using (auth.uid() = user_id);
