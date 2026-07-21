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

export type GroupMemberWithKey = {
  userId: string;
  username: string;
  avatarId: string | null;
  publicKey: string;
  role: string;
  joinedAt: string;
};

export type GroupMemberDetail = {
  userId: string;
  username: string;
  avatarId: string | null;
  publicKey: string | null;
  role: string;
  joinedAt: string;
};

export type GroupDetails = {
  id: string;
  name: string;
  avatarId: string | null;
  createdAt: string;
  myRole: string;
  myJoinedAt: string;
  members: GroupMemberDetail[];
};

export const GROUP_MEMBER_CAP = 16;

export function remainingMemberSlots(currentCount: number): number {
  return Math.max(0, GROUP_MEMBER_CAP - currentCount);
}

export function isMemberCapError(err: unknown): boolean {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : "";
  return /16|member limit|too many/i.test(message);
}

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

/** Groups the user left but still has message history on this device. */
export async function fetchLeftGroupRemnants(
  userId: string,
): Promise<(GroupRow & { isLeft: true })[]> {
  const supabase = createClient();

  const { data: msgRows, error: msgError } = await supabase
    .from("group_messages")
    .select("group_id")
    .eq("recipient_id", userId);

  if (msgError || !msgRows?.length) {
    return [];
  }

  const groupIds = [
    ...new Set(
      msgRows.map((row) => row.group_id as string).filter(Boolean),
    ),
  ];
  if (groupIds.length === 0) return [];

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .in("group_id", groupIds);

  const memberIds = new Set(
    (memberships ?? []).map((row) => row.group_id as string),
  );
  const leftIds = groupIds.filter((id) => !memberIds.has(id));
  if (leftIds.length === 0) return [];

  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, avatar, created_at")
    .in("id", leftIds);

  if (groupsError || !groups?.length) {
    return [];
  }

  return groups.map((g) => ({
    id: g.id as string,
    name: g.name as string,
    avatarId: (g.avatar as string | null) ?? null,
    memberCount: 0,
    createdAt: g.created_at as string,
    isLeft: true as const,
  }));
}

export async function fetchGroupMembersWithKeys(
  groupId: string,
  userId: string,
): Promise<
  { ok: true; members: GroupMemberWithKey[] } | { ok: false; error: string }
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

  const { data: rows, error } = await supabase
    .from("group_members")
    .select(
      `
      user_id,
      role,
      joined_at,
      profiles (
        username,
        avatar_id,
        public_key
      )
    `,
    )
    .eq("group_id", groupId);

  if (error || !rows?.length) {
    return { ok: false, error: "Could not load members." };
  }

  const members: GroupMemberWithKey[] = [];
  for (const row of rows) {
    const raw = row.profiles as
      | {
          username: string;
          avatar_id: string | null;
          public_key: string | null;
        }
      | {
          username: string;
          avatar_id: string | null;
          public_key: string | null;
        }[]
      | null;
    const profile = Array.isArray(raw) ? raw[0] : raw;
    const publicKey = (profile?.public_key as string | null)?.trim();
    if (!profile || !publicKey) continue;
    members.push({
      userId: row.user_id as string,
      username: profile.username as string,
      avatarId: (profile.avatar_id as string | null) ?? null,
      publicKey,
      role: row.role as string,
      joinedAt: row.joined_at as string,
    });
  }

  if (members.length === 0) {
    return { ok: false, error: "Could not load member encryption keys." };
  }

  return { ok: true, members };
}

function sortGroupMembers(members: GroupMemberDetail[]): GroupMemberDetail[] {
  return [...members].sort((a, b) => {
    const aAdmin = a.role === "admin" ? 0 : 1;
    const bAdmin = b.role === "admin" ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}

export async function fetchGroupDetails(
  groupId: string,
  userId: string,
): Promise<{ ok: true; details: GroupDetails } | { ok: false; error: string }> {
  const supabase = createClient();

  const { data: myMembership, error: membershipError } = await supabase
    .from("group_members")
    .select("role, joined_at")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !myMembership) {
    return { ok: false, error: "Group not found." };
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, avatar, created_at")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) {
    return { ok: false, error: "Group not found." };
  }

  const { data: rows, error: membersError } = await supabase
    .from("group_members")
    .select(
      `
      user_id,
      role,
      joined_at,
      profiles (
        username,
        avatar_id,
        public_key
      )
    `,
    )
    .eq("group_id", groupId);

  if (membersError || !rows?.length) {
    return { ok: false, error: "Could not load members." };
  }

  const members: GroupMemberDetail[] = [];
  for (const row of rows) {
    const raw = row.profiles as
      | {
          username: string;
          avatar_id: string | null;
          public_key: string | null;
        }
      | {
          username: string;
          avatar_id: string | null;
          public_key: string | null;
        }[]
      | null;
    const profile = Array.isArray(raw) ? raw[0] : raw;
    if (!profile) continue;
    members.push({
      userId: row.user_id as string,
      username: profile.username as string,
      avatarId: (profile.avatar_id as string | null) ?? null,
      publicKey: (profile.public_key as string | null)?.trim() ?? null,
      role: row.role as string,
      joinedAt: row.joined_at as string,
    });
  }

  return {
    ok: true,
    details: {
      id: group.id as string,
      name: group.name as string,
      avatarId: (group.avatar as string | null) ?? null,
      createdAt: group.created_at as string,
      myRole: myMembership.role as string,
      myJoinedAt: myMembership.joined_at as string,
      members: sortGroupMembers(members),
    },
  };
}

export async function updateGroupName(
  groupId: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    return { ok: false, error: "Group name must be 1–40 characters." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("groups")
    .update({ name: trimmed })
    .eq("id", groupId);

  if (error) {
    return { ok: false, error: "Could not update group name." };
  }

  return { ok: true };
}

export async function updateGroupAvatar(
  groupId: string,
  avatarId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("groups")
    .update({ avatar: avatarId })
    .eq("id", groupId);

  if (error) {
    return { ok: false, error: "Could not update group avatar." };
  }

  return { ok: true };
}

export async function addGroupMembers(
  groupId: string,
  memberIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (memberIds.length === 0) {
    return { ok: false, error: "Pick at least one member." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("group_members").insert(
    memberIds.map((userId) => ({
      group_id: groupId,
      user_id: userId,
      role: "member",
    })),
  );

  if (error) {
    if (isMemberCapError(error)) {
      return { ok: false, error: MEMBER_CAP_MESSAGE };
    }
    return { ok: false, error: "Could not add members." };
  }

  return { ok: true };
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "Could not remove member." };
  }

  return { ok: true };
}

export async function promoteGroupAdmin(
  groupId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .update({ role: "admin" })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "Could not promote member." };
  }

  return { ok: true };
}

export async function leaveGroup(
  groupId: string,
  userId: string,
): Promise<
  | { ok: true }
  | { ok: false; error: string; needsAdminPromotion?: boolean }
> {
  const supabase = createClient();

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", groupId);

  if (membersError || !members?.length) {
    return { ok: false, error: "Could not leave group." };
  }

  const admins = members.filter((m) => m.role === "admin");
  const myMembership = members.find((m) => m.user_id === userId);
  if (!myMembership) {
    return { ok: false, error: "You are not in this group." };
  }

  const isSoleAdmin =
    myMembership.role === "admin" &&
    admins.length === 1 &&
    members.length > 1;

  if (isSoleAdmin) {
    return {
      ok: false,
      error: "Choose a new admin first.",
      needsAdminPromotion: true,
    };
  }

  const { error: deleteError } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (deleteError) {
    return { ok: false, error: "Could not leave group." };
  }

  if (members.length === 1) {
    await supabase.from("groups").delete().eq("id", groupId);
  }

  return { ok: true };
}

export async function fetchGroupForInbox(
  groupId: string,
  userId: string,
): Promise<GroupRow | null> {
  const supabase = createClient();

  const { data: membership } = await supabase
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
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) return null;

  const raw = membership.groups as
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
  if (!g) return null;

  const { count } = await supabase
    .from("group_members")
    .select("group_id", { count: "exact", head: true })
    .eq("group_id", groupId);

  return {
    id: g.id,
    name: g.name,
    avatarId: g.avatar,
    memberCount: count ?? 1,
    createdAt: g.created_at,
  };
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
