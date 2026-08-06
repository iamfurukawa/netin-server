import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { Database } from "../../db/client.js";
import { createSession, createUser, deleteSession, findSessionUser, findUserByEmail, type UserRecord } from "./auth.repository.js";
import type { Credentials, RegisterInput } from "./auth.schemas.js";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const sessionLifetimeDays = 30;

export class AuthenticationError extends Error {}
export class DuplicateEmailError extends Error {}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, encodedSalt, encodedKey] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey) return false;
  const expected = Buffer.from(encodedKey, "base64url");
  const actual = (await scrypt(password, Buffer.from(encodedSalt, "base64url"), keyLength)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

async function openSession(database: Database, user: UserRecord) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeDays * 24 * 60 * 60 * 1000);
  await createSession(database, user.id, hashToken(token), expiresAt);
  return { token, expiresAt };
}

export async function register(database: Database, input: RegisterInput) {
  const user = await createUser(database, {
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    color: input.color ?? null,
  });
  if (!user) throw new DuplicateEmailError();
  return { user, session: await openSession(database, user) };
}

export async function login(database: Database, input: Credentials) {
  const user = await findUserByEmail(database, input.email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AuthenticationError();
  return { user, session: await openSession(database, user) };
}

export async function logout(database: Database, token: string) {
  await deleteSession(database, hashToken(token));
}

export async function currentUser(database: Database, token: string) {
  return findSessionUser(database, hashToken(token));
}

export function toPublicUser(user: UserRecord) {
  return { id: user.id, email: user.email, displayName: user.displayName, color: user.color };
}
