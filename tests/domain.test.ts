import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reward,
  canonicalPost,
  rulesSchema,
  maxReward,
} from "../src/lib/domain";
import {
  encrypt,
  decrypt,
  passwordHash,
  passwordValid,
  totp,
} from "../src/lib/auth";
const cpm = rulesSchema.parse({
  model: "CPM_LINEAR",
  rate: 2000,
  minViews: 5000,
  cap: 100000,
});
test("CPM uses all validated views after the threshold, floors rupiah, caps reward", () => {
  assert.equal(reward(cpm, 4999), 0);
  assert.equal(reward(cpm, 5000), 10000);
  assert.equal(reward(cpm, 12345), 24690);
  assert.equal(reward(cpm, 60000), 100000);
  assert.equal(reward({ ...cpm, rate: 1501 }, 5001), 7506);
  assert.throws(() => reward(cpm, -1));
  assert.throws(() => reward(cpm, 1.5));
});
test("highest tier is exclusive, fixed reward ignores views", () => {
  const tiers = rulesSchema.parse({
    model: "VIEW_TIER_HIGHEST",
    rate: 0,
    minViews: 0,
    cap: 250000,
    tiers: [
      { views: 10000, amount: 25000 },
      { views: 50000, amount: 100000 },
      { views: 100000, amount: 250000 },
    ],
  });
  assert.equal(reward(tiers, 9999), 0);
  assert.equal(reward(tiers, 50000), 100000);
  assert.equal(reward(tiers, 200000), 250000);
  assert.equal(maxReward(tiers), 250000);
  assert.equal(
    reward({ ...cpm, model: "FIXED_APPROVED", rate: 20000 }, 0),
    20000,
  );
  assert.throws(() =>
    rulesSchema.parse({
      ...tiers,
      tiers: [
        { views: 10000, amount: 50000 },
        { views: 9000, amount: 25000 },
      ],
    }),
  );
});
test("canonical post identity removes tracking and resists host / scheme confusion", () => {
  assert.equal(
    canonicalPost(
      "https://www.tiktok.com/@foo/video/1234567890123456789?x=1",
      "tiktok",
    ).key,
    "tiktok:1234567890123456789",
  );
  assert.equal(
    canonicalPost("https://www.instagram.com/p/AbCdef123/?x=1", "instagram")
      .key,
    canonicalPost("https://instagram.com/reel/AbCdef123/", "instagram").key,
  );
  for (const url of [
    "http://tiktok.com/@foo/video/1234567890123456789",
    "https://tiktok.com.evil.test/@foo/video/1234567890123456789",
    "https://tiktok.com@evil.test/@foo/video/1234567890123456789",
    "https://vm.tiktok.com/xxx",
    "https://127.0.0.1/",
  ])
    assert.throws(() => canonicalPost(url, "tiktok"));
});
test("encryption is authenticated and password comparison rejects wrong credentials", () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const a = encrypt("1234567890"),
    b = encrypt("1234567890");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "1234567890");
  const tampered = Buffer.from(a, "base64");
  tampered[15] ^= 1;
  assert.throws(() => decrypt(tampered.toString("base64")));
  const h = passwordHash("correct horse battery staple");
  assert.equal(passwordValid("correct horse battery staple", h), true);
  assert.equal(passwordValid("incorrect", h), false);
});
test("TOTP matches RFC 6238 SHA1 truncated six-digit vectors", () => {
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1), "287082");
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 37037036), "081804");
});
