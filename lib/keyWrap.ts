/**
 * Password-based wrap/unwrap for opaque private key bytes.
 *
 * Additive crypto (same pattern as fileCrypto): takes existing key material as
 * bytes and never interprets key formats. Does not touch keystore or message crypto.
 */

import sodium from "libsodium-wrappers-sumo";

const B64 = () => sodium.base64_variants.ORIGINAL;

let sodiumReady: Promise<void> | null = null;

async function ready(): Promise<void> {
  if (!sodiumReady) {
    sodiumReady = sodium.ready;
  }
  await sodiumReady;
}

export class WrongPasswordOrCorrupt extends Error {
  constructor(message = "Wrong password or corrupt wrapped key") {
    super(message);
    this.name = "WrongPasswordOrCorrupt";
  }
}

export type WrappedPrivateKey = {
  wrapped: string;
  salt: string;
  nonce: string;
  ops: number;
  mem: number;
};

function deriveKek(
  password: string,
  salt: Uint8Array,
  ops: number,
  mem: number,
): Uint8Array {
  return sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    ops,
    mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function zeroKek(kek: Uint8Array): void {
  if (typeof sodium.memzero === "function") {
    sodium.memzero(kek);
  } else {
    kek.fill(0);
  }
}

/**
 * Wrap opaque private-key bytes with a password (Argon2id → secretbox).
 * Uses OPSLIMIT_MODERATE / MEMLIMIT_MODERATE (~1s on phones is expected).
 */
export async function wrapPrivateKey(
  privateKeyBytes: Uint8Array,
  password: string,
): Promise<WrappedPrivateKey> {
  await ready();

  const ops = sodium.crypto_pwhash_OPSLIMIT_MODERATE;
  const mem = sodium.crypto_pwhash_MEMLIMIT_MODERATE;
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const kek = deriveKek(password, salt, ops, mem);

  try {
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const wrapped = sodium.crypto_secretbox_easy(privateKeyBytes, nonce, kek);

    return {
      wrapped: sodium.to_base64(wrapped, B64()),
      salt: sodium.to_base64(salt, B64()),
      nonce: sodium.to_base64(nonce, B64()),
      ops,
      mem,
    };
  } finally {
    zeroKek(kek);
  }
}

/**
 * Unwrap a password-wrapped private key using the stored salt/nonce/ops/mem.
 * Wrong password or tampered blob → WrongPasswordOrCorrupt.
 */
export async function unwrapPrivateKey(
  wrapped: string,
  salt: string,
  nonce: string,
  ops: number,
  mem: number,
  password: string,
): Promise<Uint8Array> {
  await ready();

  const saltBytes = sodium.from_base64(salt, B64());
  const nonceBytes = sodium.from_base64(nonce, B64());
  const wrappedBytes = sodium.from_base64(wrapped, B64());
  const kek = deriveKek(password, saltBytes, ops, mem);

  try {
    try {
      return sodium.crypto_secretbox_open_easy(wrappedBytes, nonceBytes, kek);
    } catch {
      throw new WrongPasswordOrCorrupt();
    }
  } finally {
    zeroKek(kek);
  }
}
