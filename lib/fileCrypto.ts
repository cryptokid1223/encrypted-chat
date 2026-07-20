import sodium from "libsodium-wrappers-sumo";

/** Attachment metadata — will ride inside encrypted message bodies in a future integration. */
export interface AttachmentMeta {
  v: 1;
  kind: "image" | "video";
  path: string;
  key: string;
  nonce: string;
  mime: string;
  size: number;
  w?: number;
  h?: number;
  durationMs?: number;
}

const B64 = () => sodium.base64_variants.ORIGINAL;

let sodiumReady: Promise<void> | null = null;

async function ready(): Promise<void> {
  if (!sodiumReady) {
    sodiumReady = sodium.ready;
  }
  await sodiumReady;
}

export async function encryptFile(
  fileBytes: Uint8Array,
): Promise<{ ciphertext: Uint8Array; fileKey: string; nonce: string }> {
  await ready();

  const key = sodium.crypto_secretbox_keygen();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(fileBytes, nonce, key);

  return {
    ciphertext,
    fileKey: sodium.to_base64(key, B64()),
    nonce: sodium.to_base64(nonce, B64()),
  };
}

export async function decryptFile(
  ciphertext: Uint8Array,
  fileKeyB64: string,
  nonceB64: string,
): Promise<Uint8Array> {
  await ready();

  try {
    return sodium.crypto_secretbox_open_easy(
      ciphertext,
      sodium.from_base64(nonceB64, B64()),
      sodium.from_base64(fileKeyB64, B64()),
    );
  } catch {
    throw new Error(
      "File decryption failed — ciphertext may be corrupt, tampered, or the wrong key was used",
    );
  }
}
