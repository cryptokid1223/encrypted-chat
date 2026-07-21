-- =============================================================================
-- Message edits — edit_of column (paste into Supabase SQL editor)
-- =============================================================================
-- Edits are new encrypted rows referencing the original message. Plaintext
-- stays inside ciphertext; edit_of enables unread/preview filtering without
-- decrypting every row.
--
-- DM: edit_of references messages.id (original row id)
-- Group: edit_of references group_messages.message_uuid (logical message id)
-- =============================================================================

-- 1) Columns ------------------------------------------------------------------

alter table public.messages
  add column if not exists edit_of uuid null;

alter table public.group_messages
  add column if not exists edit_of uuid null;

create index if not exists messages_edit_of_idx
  on public.messages (edit_of)
  where edit_of is not null;

create index if not exists group_messages_edit_of_idx
  on public.group_messages (edit_of)
  where edit_of is not null;

comment on column public.messages.edit_of is
  'When set, this row is an edit of the referenced messages.id. Excluded from unread counts.';

comment on column public.group_messages.edit_of is
  'When set, this row is an edit of the referenced message_uuid. Excluded from unread counts.';

-- 2) Unread counts RPC — exclude edit rows -----------------------------------

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
              and m.edit_of is null
              and m.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
          )
        end
      else (
        select count(*)::bigint
        from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> uid
          and m.edit_of is null
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
              and gm.edit_of is null
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
      and gm.created_at > coalesce(cc.cleared_at, '-infinity'::timestamptz)
    order by gm.created_at desc, gm.id desc
    limit 1
  ) latest on true
  where mem.user_id = uid;
end;
$$;

revoke all on function public.get_my_unread_counts() from public;
grant execute on function public.get_my_unread_counts() to authenticated;
