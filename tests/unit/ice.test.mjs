import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hmsAppToken, iceServersFor } from "../../supabase/functions/_shared/ice.ts";

test("default is STUN only", async () => {
  const r = await iceServersFor("u1", () => undefined);
  assert.equal(r.provider, "stun");
  assert.equal(r.iceServers.length, 1);
  assert.match(String(r.iceServers[0].urls), /^stun:/);
});

test("coturn: TURN REST credentials match coturn's use-auth-secret scheme", async () => {
  const env = { ICE_PROVIDER: "coturn", TURN_SECRET: "s3cret", TURN_URLS: "turn:turn.example:3478?transport=udp, turns:turn.example:5349?transport=tcp", TURN_TTL: "600" };
  const r = await iceServersFor("user-9", (k) => env[k], 1_000);
  const turn = r.iceServers[1];
  assert.equal(r.provider, "coturn"); assert.equal(r.ttl, 600);
  assert.equal(turn.username, "1600:user-9");
  assert.equal(turn.credential, createHmac("sha1", "s3cret").update("1600:user-9").digest("base64"));
  assert.deepEqual(turn.urls, ["turn:turn.example:3478?transport=udp", "turns:turn.example:5349?transport=tcp"]);
});

test("coturn without secret and bad static JSON fall back to STUN", async () => {
  assert.equal((await iceServersFor("u", (k) => ({ ICE_PROVIDER: "coturn" })[k])).provider, "stun");
  assert.equal((await iceServersFor("u", (k) => ({ ICE_PROVIDER: "static", ICE_SERVERS_JSON: "{oops" })[k])).provider, "stun");
  const s = await iceServersFor("u", (k) => ({ ICE_PROVIDER: "static", ICE_SERVERS_JSON: '[{"urls":"turn:t:3478","username":"a","credential":"b"}]' })[k]);
  assert.equal(s.provider, "static"); assert.equal(s.iceServers.length, 2);
});

test("100ms app token is a valid HS256 JWT", async () => {
  const t = await hmsAppToken({ accessKey: "ak", secret: "sec", roomId: "room1", userId: "u1", role: "guest", nowSec: 100, ttl: 60 });
  const [h, p, sig] = t.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(payload.room_id, "room1"); assert.equal(payload.exp, 160); assert.equal(payload.type, "app");
  assert.equal(sig, createHmac("sha256", "sec").update(`${h}.${p}`).digest("base64url"));
});
