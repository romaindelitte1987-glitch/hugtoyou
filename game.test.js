import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, move, snapshot, tick } from "./game.js";
import { rollMs, introMs } from "./public/rules.js";

const pick = () => 0;
function lobby() {
  const room = createRoom(0);
  move(room, 0, { action: "join", name: "Alice" }, 0);
  move(room, 1, { action: "join", name: "Robin" }, 0);
  move(room, 0, { action: "choices", give: [2, 5], take: [8] }, 0);
  move(room, 1, { action: "choices", give: [8], take: [2] }, 0);
  return room;
}
function activeRoom() {
  const room = lobby();
  move(room, 0, { action: "ready" }, 0, pick);
  move(room, 1, { action: "ready" }, 0, pick);
  return room;
}
function turn(room, action, now, slot = room.turn) {
  return move(room, slot, { action, turnId: room.turnId }, now, pick);
}

test("deux validations et compatibilité par direction, choix de l’autre masqués", () => {
  const room = lobby();
  move(room, 0, { action: "ready" }, 0, pick);
  assert.equal(room.phase, "lobby");
  assert.equal(snapshot(room, 0, 0).other.give, undefined);
  move(room, 1, { action: "choices", give: [1], take: [2] }, 1);
  assert.equal(room.players[0].ready, false);
  assert.throws(() => move(room, 1, { action: "ready" }, 1), /compatible/);
  const started = activeRoom();
  turn(started, "roll", introMs);
  assert.equal(started.mission.choice, 2);
  assert.equal(snapshot(started, 1, introMs).mission, null);
  assert.equal(snapshot(started, 1, introMs).phase, "waiting");
});

test("relance, expiration et alternance", () => {
  const room = activeRoom();
  turn(room, "roll", introMs);
  assert.throws(() => turn(room, "accept", introMs));
  turn(room, "reroll", introMs + rollMs);
  assert.equal(room.players[0].gems, 1);
  assert.equal(room.mission.seconds, 40);
  const deadline = room.mission.until;
  assert.equal(tick(room, deadline), true);
  assert.equal(tick(room, deadline + 1), false);
  assert.equal(room.players[0].hearts, 2);
  assert.equal(room.turn, 1);
});

test("mission acceptée à 29 min 58 s prolongée jusqu’à son terme", () => {
  const room = activeRoom();
  turn(room, "roll", room.end - 3000);
  turn(room, "accept", room.end - 2000);
  assert.equal(tick(room, room.end), false);
  assert.equal(room.phase, "active");
  assert.equal(tick(room, room.mission.until), true);
  assert.equal(room.phase, "ended");
  assert.deepEqual(room.players[0].give, []);
});

test("arrêt immédiat depuis l’autre téléphone", () => {
  const room = activeRoom();
  turn(room, "roll", introMs);
  turn(room, "accept", introMs + rollMs);
  turn(room, "stop", introMs + rollMs + 1, 1);
  assert.equal(room.phase, "ended");
  assert.equal(room.players[0].hearts, 3);
});
