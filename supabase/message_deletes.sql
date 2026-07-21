-- =============================================================================
-- Message deletes + per-user hides (paste into Supabase SQL editor)
-- =============================================================================
-- Delete-for-everyone: delete_of column (like edit_of). Delete-for-me:
-- message_hides table. Run after message_edits.sql if that migration exists.
-- =============================================================================

-- 1) delete_of columns -------------------------------------------------------

alter table public.messages
  add column if not exists delete_of uuid null;

alter table public.group_messages
  add column if not exists delete_of uuid null;

create index if not exists messages_delete_of_idx
  on public.messages (delete_of)
  where delete_of is not null;

create index if not exists group_messages_delete_of_idx
  on public.group_messages (delete_of)
  where delete_of is not null;

comment on column public.messages.delete_of is
  'When set, this row deletes the referenced messages.id for everyone.';

comment on column public.group_messages.delete_of is
  'When set, this row deletes the referenced message_uuid for everyone.';

-- 2) message_hides (delete-for-me) -------------------------------------------

create table if not exists public.message_hides (
  user_id uuid not null references auth.users (id) on delete cascade,
  message_uuid uuid not null,
  conversation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, message_uuid)
);

create index if not exists message_hides_user_conversation_idx
  on public.message_hides (user_id, conversation_id);

comment on table public.message_hides is
  'Per-user hide of a single message (DM messages.id or group message_uuid).';

alter table public.message_hides enable row level security;

drop policy if exists "message_hides_select_own" on public.message_hides;
create policy "message_hides_select_own"
  on public.message_hides
  for select
  using (auth.uid() = user_id);

drop policy if exists "message_hides_insert_own" on public.message_hides;
create policy "message_hides_insert_own"
  on public.message_hides
  for insert
  with check (auth.uid() = user_id);

-- No update/delete policy.

-- 3) Unread counts RPC — exclude edit and delete rows ------------------------

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
              and m.edit_of is null
              and m.delete_of is null
              and m.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
          )
        end
      else (
        select count(*)::bigint
        from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> uid
          and m.edit_of is null
          and m.delete_of is null
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
      and m.edit_of is null
      and m.delete_of is null
      and m.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  where c.participant_a = uid
     or c.participant_b = uid

  union all

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
              and gm.edit_of is null
              and gm.delete_of is null
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
          and gm.edit_of is null
          and gm.delete_of is null
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
      and gm.edit_of is null
      and gm.delete_of is null
      and gm.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
    order by gm.created_at desc, gm.id desc
    limit 1
  ) latest on true
  where mem.user_id = uid;
end;
$$;

revoke all on function public.get_my_unread_counts() from public;
grant execute on function public.get_my_unread_counts() to authenticated;
