import sodium from "libsodium-wrappers-sumo";

const B64 = () => sodium.base64_variants.ORIGINAL;

let sodiumReady: Promise<void> | null = null;

/** Call once at app start — subsequent crypto ops reuse the same ready promise. */
export function warmSodium(): Promise<void> {
  if (!sodiumReady) {
    sodiumReady = sodium.ready;
  }
  return sodiumReady;
}

async function ready() {
  await warmSodium();
}

export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  await ready();
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(publicKey, B64()),
    privateKey: sodium.to_base64(privateKey, B64()),
  };
}

/** Derive the Curve25519 public key that corresponds to a crypto_box secret key. */
export async function publicKeyFromPrivateKey(
  privateKeyB64: string,
): Promise<string> {
  await ready();
  const sk = sodium.from_base64(privateKeyB64, B64());
  const pk = sodium.crypto_scalarmult_base(sk);
  return sodium.to_base64(pk, B64());
}

export async function encryptMessage(
  plaintext: string,
  theirPublicKeyB64: string,
  myPrivateKeyB64: string,
): Promise<{ ciphertext: string; nonce: string }> {
  await ready();

  // Always generate a fresh nonce — never reuse.
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

  const ciphertext = sodium.crypto_box_easy(
    plaintext,
    nonce,
    sodium.from_base64(theirPublicKeyB64, B64()),
    sodium.from_base64(myPrivateKeyB64, B64()),
  );

  return {
    ciphertext: sodium.to_base64(ciphertext, B64()),
    nonce: sodium.to_base64(nonce, B64()),
  };
}

export async function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  theirPublicKeyB64: string,
  myPrivateKeyB64: string,
): Promise<string> {
  await ready();

  console.count("decrypt");
  try {
    const plaintext = sodium.crypto_box_open_easy(
      sodium.from_base64(ciphertextB64, B64()),
      sodium.from_base64(nonceB64, B64()),
      sodium.from_base64(theirPublicKeyB64, B64()),
      sodium.from_base64(myPrivateKeyB64, B64()),
    );
    return sodium.to_string(plaintext);
  } catch {
    throw new Error("Decryption failed — ciphertext may be corrupt or the wrong key was used");
  }
}
