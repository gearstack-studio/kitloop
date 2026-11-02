import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const DUMMY_HASH = `scrypt:${"00".repeat(16)}:${"00".repeat(KEY_LENGTH)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = (storedHash ?? DUMMY_HASH).split(":");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(saltHex ?? "") ||
    !/^[a-f0-9]{128}$/.test(keyHex ?? "")
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH)) as Buffer;
  return timingSafeEqual(actual, expected) && storedHash !== undefined;
}
