-- =============================================================================
-- Per-user conversation clears (paste into Supabase SQL editor)
-- =============================================================================
-- Hides a DM or group thread from the caller's inbox and message history without
-- deleting any message rows. Re-upserting bumps cleared_at for a fresh cut.
-- =============================================================================

-- 1) Table -------------------------------------------------------------------

create table if not exists public.conversation_clears (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_type text not null
    check (conversation_type in ('dm', 'group')),
  conversation_id uuid not null,
  cleared_at timestamptz not null default now(),
  primary key (user_id, conversation_type, conversation_id)
);

create index if not exists conversation_clears_user_id_idx
  on public.conversation_clears (user_id);

comment on table public.conversation_clears is
  'Per-user hide cursor for DM (conversations.id) and group (groups.id) threads.';

-- 2) RLS ---------------------------------------------------------------------

alter table public.conversation_clears enable row level security;

drop policy if exists "conversation_clears_select_own" on public.conversation_clears;
create policy "conversation_clears_select_own"
  on public.conversation_clears
  for select
  using (auth.uid() = user_id);

drop policy if exists "conversation_clears_insert_own" on public.conversation_clears;
create policy "conversation_clears_insert_own"
  on public.conversation_clears
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "conversation_clears_update_own" on public.conversation_clears;
create policy "conversation_clears_update_own"
  on public.conversation_clears
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy (users cannot delete their clear rows).

-- 3) Unread counts RPC — respects conversation_clears ----------------------

create or replace function public.get_my_unread_counts()
returns table (
  conversation_type text,
  conversation_id uuid,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  return query
  -- Direct messages
  select
    'dm'::text as conversation_type,
    c.id as conversation_id,
    case
      when rs.last_read_at is null then
        case
          when latest.sender_id is null then 0::bigint
          when latest.sender_id = uid then 0::bigint
          else (
            select count(*)::bigint
            from public.messages m
            where m.conversation_id = c.id
              and m.sender_id <> uid
              and m.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
          )
        end
      else (
        select count(*)::bigint
        from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> uid
          and m.created_at > rs.last_read_at
          and m.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
      )
    end as unread_count
  from public.conversations c
  left join public.read_states rs
    on rs.user_id = uid
   and rs.conversation_type = 'dm'
   and rs.conversation_id = c.id
  left join public.conversation_clears cc
    on cc.user_id = uid
   and cc.conversation_type = 'dm'
   and cc.conversation_id = c.id
  left join lateral (
    select m.sender_id
    from public.messages m
    where m.conversation_id = c.id
      and m.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  where c.participant_a = uid
     or c.participant_b = uid

  union all

  -- Groups (count distinct logical messages on my recipient copies)
  select
    'group'::text as conversation_type,
    g.id as conversation_id,
    case
      when rs.last_read_at is null then
        case
          when latest.sender_id is null then 0::bigint
          when latest.sender_id = uid then 0::bigint
          else (
            select count(distinct gm.message_uuid)::bigint
            from public.group_messages gm
            where gm.group_id = g.id
              and gm.recipient_id = uid
              and gm.sender_id <> uid
              and gm.created_at >= coalesce(mem.joined_at, '-infinity'::timestamptz)
              and gm.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
          )
        end
      else (
        select count(distinct gm.message_uuid)::bigint
        from public.group_messages gm
        where gm.group_id = g.id
          and gm.recipient_id = uid
          and gm.sender_id <> uid
          and gm.created_at > rs.last_read_at
          and gm.created_at >= coalesce(mem.joined_at, '-infinity'::timestamptz)
          and gm.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
      )
    end as unread_count
  from public.group_members mem
  join public.groups g on g.id = mem.group_id
  left join public.read_states rs
    on rs.user_id = uid
   and rs.conversation_type = 'group'
   and rs.conversation_id = g.id
  left join public.conversation_clears cc
    on cc.user_id = uid
   and cc.conversation_type = 'group'
   and cc.conversation_id = g.id
  left join lateral (
    select gm.sender_id
    from public.group_messages gm
    where gm.group_id = g.id
      and gm.recipient_id = uid
      and gm.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
    order by gm.created_at desc, gm.id desc
    limit 1
  ) latest on true
  where mem.user_id = uid;
end;
$$;

revoke all on function public.get_my_unread_counts() from public;
grant execute on function public.get_my_unread_counts() to authenticated;
