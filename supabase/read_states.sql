-- =============================================================================
-- Read-state / unread counts (paste into Supabase SQL editor)
-- =============================================================================
-- Tracks per-user last-read timestamps for DMs and groups, plus an RPC that
-- returns unread counts for the chats list in one round-trip.
-- =============================================================================

-- 1) Table -------------------------------------------------------------------

create table if not exists public.read_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_type text not null
    check (conversation_type in ('dm', 'group')),
  conversation_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation_type, conversation_id)
);

create index if not exists read_states_user_id_idx
  on public.read_states (user_id);

comment on table public.read_states is
  'Per-user last-read cursor for DM (conversations.id) and group (groups.id) threads.';

-- 2) RLS ---------------------------------------------------------------------

alter table public.read_states enable row level security;

drop policy if exists "read_states_select_own" on public.read_states;
create policy "read_states_select_own"
  on public.read_states
  for select
  using (auth.uid() = user_id);

drop policy if exists "read_states_insert_own" on public.read_states;
create policy "read_states_insert_own"
  on public.read_states
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "read_states_update_own" on public.read_states;
create policy "read_states_update_own"
  on public.read_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy (users cannot delete their read_states rows).

-- 3) Unread counts RPC -------------------------------------------------------
-- Returns one row per DM/group the caller belongs to.
-- Rules:
--   * Count only messages from others (sender_id <> me).
--   * Groups: DISTINCT message_uuid on recipient_id = me rows; ignore
--     pre-join via group_members.joined_at.
--   * No read_states row → treat as epoch, EXCEPT when I sent the latest
--     visible message (then unread = 0).

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
          )
        end
      else (
        select count(*)::bigint
        from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> uid
          and m.created_at > rs.last_read_at
      )
    end as unread_count
  from public.conversations c
  left join public.read_states rs
    on rs.user_id = uid
   and rs.conversation_type = 'dm'
   and rs.conversation_id = c.id
  left join lateral (
    select m.sender_id
    from public.messages m
    where m.conversation_id = c.id
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
      )
    end as unread_count
  from public.group_members mem
  join public.groups g on g.id = mem.group_id
  left join public.read_states rs
    on rs.user_id = uid
   and rs.conversation_type = 'group'
   and rs.conversation_id = g.id
  left join lateral (
    select gm.sender_id
    from public.group_messages gm
    where gm.group_id = g.id
      and gm.recipient_id = uid
    order by gm.created_at desc, gm.id desc
    limit 1
  ) latest on true
  where mem.user_id = uid;
end;
$$;

revoke all on function public.get_my_unread_counts() from public;
grant execute on function public.get_my_unread_counts() to authenticated;
