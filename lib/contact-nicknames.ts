import { createClient } from "@/lib/supabase/client";

export type ContactNicknameRow = {
  contact_id: string;
  nickname: string;
};

/** Fetch all nicknames owned by the current user. */
export async function fetchContactNicknames(): Promise<
  Record<string, string>
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from("contact_nicknames")
    .select("contact_id, nickname")
    .eq("owner_id", user.id);

  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const row of data as ContactNicknameRow[]) {
    const nick = row.nickname?.trim();
    if (nick) map[row.contact_id] = nick;
  }
  return map;
}

/** Upsert nickname for a contact (owner_id = current user). */
export async function upsertContactNickname(
  contactId: string,
  nickname: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const trimmed = nickname.trim();
  if (!trimmed) {
    return deleteContactNickname(contactId);
  }

  const { error } = await supabase.from("contact_nicknames").upsert(
    {
      owner_id: user.id,
      contact_id: contactId,
      nickname: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,contact_id" },
  );

  if (error) return { ok: false, error: "Could not save nickname." };
  return { ok: true };
}

/** Remove nickname for a contact. */
export async function deleteContactNickname(
  contactId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("contact_nicknames")
    .delete()
    .eq("owner_id", user.id)
    .eq("contact_id", contactId);

  if (error) return { ok: false, error: "Could not clear nickname." };
  return { ok: true };
}
