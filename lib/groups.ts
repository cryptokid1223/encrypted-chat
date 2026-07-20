import { createClient } from "@/lib/supabase/client";

export type GroupRow = {
  id: string;
  name: string;
  avatarId: string | null;
  memberCount: number;
  createdAt: string;
};

export type GroupMemberCandidate = {
  id: string;
  username: string;
  avatarId: string | null;
};

const MEMBER_CAP_MESSAGE =
  "This group has reached the member limit. Try fewer members.";

export async function lookupGroupMemberCandidate(
  username: string,
  myUserId: string,
): Promise<
  | { ok: true; member: GroupMemberCandidate }
  | { ok: false; error: string }
> {
  const cleaned = username.trim().toLowerCase();
  if (!cleaned) {
    return { ok: false, error: "Enter a username." };
  }

  const supabase = createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_id, public_key")
    .eq("username", cleaned)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Could not look up that user. Try again." };
  }

  if (!profile) {
    return { ok: false, error: "No user with that username." };
  }

  if (profile.id === myUserId) {
    return { ok: false, error: "That's you — pick someone else." };
  }

  if (!(profile.public_key as string | null)?.trim()) {
    return {
      ok: false,
      error: "That user hasn't finished setting up encryption yet.",
    };
  }

  return {
    ok: true,
    member: {
      id: profile.id as string,
      username: profile.username as string,
      avatarId: (profile.avatar_id as string | null) ?? null,
    },
  };
}

export async function createGroupWithMembers(input: {
  name: string;
  avatarId: string | null;
  memberIds: string[];
}): Promise<{ ok: true; groupId: string } | { ok: false; error: string }> {
  const trimmedName = input.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 40) {
    return { ok: false, error: "Group name must be 1–40 characters." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({
      name: trimmedName,
      avatar: input.avatarId,
      creator_id: user.id,
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return { ok: false, error: "Could not create group. Try again." };
  }

  const groupId = group.id as string;

  try {
    const { error: adminError } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: user.id,
      role: "admin",
    });
    if (adminError) throw adminError;

    if (input.memberIds.length > 0) {
      const { error: membersError } = await supabase.from("group_members").insert(
        input.memberIds.map((userId) => ({
          group_id: groupId,
          user_id: userId,
          role: "member",
        })),
      );
      if (membersError) throw membersError;
    }
  } catch (err) {
    await supabase.from("groups").delete().eq("id", groupId);

    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "";

    if (/16|member limit|too many/i.test(message)) {
      return { ok: false, error: MEMBER_CAP_MESSAGE };
    }

    return { ok: false, error: "Could not add members. Try again." };
  }

  return { ok: true, groupId };
}

export async function fetchMyGroups(userId: string): Promise<GroupRow[]> {
  const supabase = createClient();

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select(
      `
      group_id,
      groups (
        id,
        name,
        avatar,
        created_at
      )
    `,
    )
    .eq("user_id", userId);

  if (error || !memberships?.length) {
    return [];
  }

  const groupIds = memberships
    .map((row) => row.group_id as string)
    .filter(Boolean);

  const { data: memberRows } = await supabase
    .from("group_members")
    .select("group_id")
    .in("group_id", groupIds);

  const countByGroup = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const gid = row.group_id as string;
    countByGroup.set(gid, (countByGroup.get(gid) ?? 0) + 1);
  }

  const groups: GroupRow[] = [];
  for (const row of memberships) {
    const raw = row.groups as
      | {
          id: string;
          name: string;
          avatar: string | null;
          created_at: string;
        }
      | {
          id: string;
          name: string;
          avatar: string | null;
          created_at: string;
        }[]
      | null;
    const g = Array.isArray(raw) ? raw[0] : raw;
    if (!g) continue;
    groups.push({
      id: g.id,
      name: g.name,
      avatarId: g.avatar,
      memberCount: countByGroup.get(g.id) ?? 1,
      createdAt: g.created_at,
    });
  }

  return groups;
}

export async function fetchGroupShell(
  groupId: string,
  userId: string,
): Promise<
  | { ok: true; name: string; avatarId: string | null; memberCount: number }
  | { ok: false; error: string }
> {
  const supabase = createClient();

  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Group not found." };
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, avatar")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) {
    return { ok: false, error: "Group not found." };
  }

  const { count, error: countError } = await supabase
    .from("group_members")
    .select("group_id", { count: "exact", head: true })
    .eq("group_id", groupId);

  if (countError) {
    return { ok: false, error: "Could not load group." };
  }

  return {
    ok: true,
    name: group.name as string,
    avatarId: (group.avatar as string | null) ?? null,
    memberCount: count ?? 1,
  };
}
