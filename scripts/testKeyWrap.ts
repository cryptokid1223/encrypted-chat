import sodium from "libsodium-wrappers-sumo";
import {
  unwrapPrivateKey,
  wrapPrivateKey,
  WrongPasswordOrCorrupt,
} from "../lib/keyWrap";

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

async function testRoundTrip(): Promise<void> {
  const privateKey = sodium.randombytes_buf(32);
  const password = "correct horse battery staple";
  const wrapped = await wrapPrivateKey(privateKey, password);
  const opened = await unwrapPrivateKey(
    wrapped.wrapped,
    wrapped.salt,
    wrapped.nonce,
    wrapped.ops,
    wrapped.mem,
    password,
  );
  assert(bytesEqual(privateKey, opened), "Round trip: bytes must match");
}

async function testWrongPassword(): Promise<void> {
  const privateKey = sodium.randombytes_buf(32);
  const wrapped = await wrapPrivateKey(privateKey, "right-password");

  let threw = false;
  try {
    await unwrapPrivateKey(
      wrapped.wrapped,
      wrapped.salt,
      wrapped.nonce,
      wrapped.ops,
      wrapped.mem,
      "wrong-password",
    );
  } catch (err) {
    threw = true;
    assert(
      err instanceof WrongPasswordOrCorrupt,
      "Wrong password: expected WrongPasswordOrCorrupt",
    );
  }
  assert(threw, "Wrong password: unwrap must throw");
}

async function testTamperedBlob(): Promise<void> {
  const privateKey = sodium.randombytes_buf(32);
  const password = "passphrase";
  const wrapped = await wrapPrivateKey(privateKey, password);

  const bytes = sodium.from_base64(
    wrapped.wrapped,
    sodium.base64_variants.ORIGINAL,
  );
  const tampered = new Uint8Array(bytes);
  tampered[0] ^= 0xff;
  const tamperedB64 = sodium.to_base64(
    tampered,
    sodium.base64_variants.ORIGINAL,
  );

  let threw = false;
  try {
    await unwrapPrivateKey(
      tamperedB64,
      wrapped.salt,
      wrapped.nonce,
      wrapped.ops,
      wrapped.mem,
      password,
    );
  } catch (err) {
    threw = true;
    assert(
      err instanceof WrongPasswordOrCorrupt,
      "Tamper: expected WrongPasswordOrCorrupt",
    );
  }
  assert(threw, "Tamper: unwrap must throw on modified ciphertext");
}

async function testWrapUniqueness(): Promise<void> {
  const privateKey = sodium.randombytes_buf(32);
  const password = "same-password";
  const first = await wrapPrivateKey(privateKey, password);
  const second = await wrapPrivateKey(privateKey, password);

  assert(first.salt !== second.salt, "Uniqueness: salts must differ");
  assert(first.nonce !== second.nonce, "Uniqueness: nonces must differ");
  assert(
    first.wrapped !== second.wrapped,
    "Uniqueness: ciphertexts must differ",
  );
}

async function testStoredOpsMemHonored(): Promise<void> {
  const privateKey = sodium.randombytes_buf(32);
  const password = "ops-mem-check";
  const wrapped = await wrapPrivateKey(privateKey, password);

  assert(
    typeof wrapped.ops === "number" && wrapped.ops > 0,
    "ops must be a positive number",
  );
  assert(
    typeof wrapped.mem === "number" && wrapped.mem > 0,
    "mem must be a positive number",
  );

  const opened = await unwrapPrivateKey(
    wrapped.wrapped,
    wrapped.salt,
    wrapped.nonce,
    wrapped.ops,
    wrapped.mem,
    password,
  );
  assert(
    bytesEqual(privateKey, opened),
    "Stored ops/mem: unwrap with returned params must succeed",
  );
}

async function main(): Promise<void> {
  await sodium.ready;

  const tests = [
    ["Round trip", testRoundTrip],
    ["Wrong password", testWrongPassword],
    ["Tampered blob", testTamperedBlob],
    ["Wrap uniqueness", testWrapUniqueness],
    ["Stored ops/mem honored", testStoredOpsMemHonored],
  ] as const;

  for (const [name, fn] of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }

  console.log("\nAll 5 keyWrap tests passed.");
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
