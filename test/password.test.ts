import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/modules/auth/auth.service.js";

test("password hashes are salted and verifiable", async () => {
  const password = "correct-horse-battery-staple";
  const hash = await hashPassword(password);

  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("not-the-password", hash), false);
});
