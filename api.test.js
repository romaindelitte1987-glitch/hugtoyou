import test from "node:test";
import assert from "node:assert/strict";
import { roomApi } from "./api.js";
import { createRoom, inviteDeadline, token } from "./game.js";

test("l’invitation expire, se renouvelle et n’est utilisable qu’une fois", async () => {
  const start = 1000;
  const room = createRoom(start);
  const [host, firstInvite] = room.keys;
  const end = inviteDeadline(room);
  const guestKey = token();
  const request = (key, action, now, extra) =>
    roomApi("room", { key, action, ...extra }, room, async () => {}, now);
  assert.equal(end - start, 15 * 60_000);
  await request(host, "join", start, { name: "Alice" });
  const waiting = await (await request(host, "state", end - 1)).json();
  assert.equal(waiting.invite.key, firstInvite);
  const guest = await (await request(firstInvite, "state", end - 1)).json();
  assert.equal(guest.invite, null);
  assert.equal(guest.needsParticipantKey, true);
  assert.equal((await request(firstInvite, "state", end)).status, 404);

  const renewed = await (await request(host, "renew-invite", end)).json();
  const nextInvite = renewed.invite.key;
  assert.notEqual(nextInvite, firstInvite);
  const duplicateRenewal = await (await request(host, "renew-invite", end + 1)).json();
  assert.equal(duplicateRenewal.invite.key, nextInvite);
  assert.equal((await request(firstInvite, "state", end + 1)).status, 404);
  assert.equal((await request(nextInvite, "join", end + 1, { name: "Lou" })).status, 400);
  const joined = await (await request(nextInvite, "join", end + 1, {
    name: "Lou", participantKey: guestKey
  })).json();
  assert.equal(joined.participantKey, guestKey);
  assert.equal(joined.me.saved, false);
  assert.equal((await request(nextInvite, "state", end + 2)).status, 404);
  const resumed = await (await request(nextInvite, "state", end + 2, { participantKey: guestKey })).json();
  assert.equal(resumed.participantKey, guestKey);
  assert.equal(resumed.me.name, "Lou");
  assert.equal((await request(guestKey, "state", renewed.invite.expiresAt + 1)).status, 200);
  const hostState = await (await request(host, "state", end + 2)).json();
  assert.equal(hostState.invite, null);
});
