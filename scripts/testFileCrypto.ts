import sodium from "libsodium-wrappers-sumo";
import { decryptFile, encryptFile } from "../lib/fileCrypto";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function testRoundTrip1Kb(): Promise<void> {
  const plain = sodium.randombytes_buf(1024);
  const { ciphertext, fileKey, nonce } = await encryptFile(plain);
  const decrypted = await decryptFile(ciphertext, fileKey, nonce);
  assert(bytesEqual(plain, decrypted), "1KB round trip: decrypted bytes must match");
}

async function testRoundTrip5Mb(): Promise<void> {
  const plain = sodium.randombytes_buf(5 * 1024 * 1024);
  const { ciphertext, fileKey, nonce } = await encryptFile(plain);
  const decrypted = await decryptFile(ciphertext, fileKey, nonce);
  assert(bytesEqual(plain, decrypted), "5MB round trip: decrypted bytes must match");
}

async function testTamperDetection(): Promise<void> {
  const plain = sodium.randombytes_buf(512);
  const { ciphertext, fileKey, nonce } = await encryptFile(plain);
  const tampered = new Uint8Array(ciphertext);
  tampered[0] ^= 0xff;

  let threw = false;
  try {
    await decryptFile(tampered, fileKey, nonce);
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error &&
        err.message.includes("File decryption failed"),
      "Tamper: expected descriptive decryption error",
    );
  }
  assert(threw, "Tamper: decrypt must throw on modified ciphertext");
}

async function testWrongKey(): Promise<void> {
  const plain = sodium.randombytes_buf(256);
  const { ciphertext, nonce } = await encryptFile(plain);
  const wrongKey = sodium.to_base64(
    sodium.crypto_secretbox_keygen(),
    sodium.base64_variants.ORIGINAL,
  );

  let threw = false;
  try {
    await decryptFile(ciphertext, wrongKey, nonce);
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error &&
        err.message.includes("File decryption failed"),
      "Wrong key: expected descriptive decryption error",
    );
  }
  assert(threw, "Wrong key: decrypt must throw");
}

async function testNonceUniqueness(): Promise<void> {
  const plain = sodium.randombytes_buf(128);
  const first = await encryptFile(plain);
  const second = await encryptFile(plain);

  assert(first.nonce !== second.nonce, "Nonce uniqueness: nonces must differ");
  assert(
    !bytesEqual(first.ciphertext, second.ciphertext),
    "Nonce uniqueness: ciphertexts must differ",
  );
}

async function main(): Promise<void> {
  await sodium.ready;

  const tests = [
    ["1KB round trip", testRoundTrip1Kb],
    ["5MB round trip", testRoundTrip5Mb],
    ["Tamper detection", testTamperDetection],
    ["Wrong key", testWrongKey],
    ["Nonce uniqueness", testNonceUniqueness],
  ] as const;

  for (const [name, fn] of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }

  console.log("\nAll 5 fileCrypto tests passed.");
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
