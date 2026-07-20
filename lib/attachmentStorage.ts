import { createClient } from "@/lib/supabase/client";

export async function uploadEncryptedAttachment(
  ciphertext: Uint8Array,
  userId: string,
): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/${crypto.randomUUID()}`;

  const { error } = await supabase.storage.from("attachments").upload(path, ciphertext, {
    contentType: "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return path;
}
