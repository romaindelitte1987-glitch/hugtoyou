import { zones, actions, durations, decisionMs, gameMs, roomMs, rollMs, introMs } from "./public/rules.js";

export class GameError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

export const token = () => crypto.randomUUID().replaceAll("-", "");
const inviteMs = 15 * 60_000;
export const inviteDeadline = room => room.inviteExpiresAt ?? room.expiresAt;
const random = count => crypto.getRandomValues(new Uint32Array(1))[0] % count;

export function createRoom(now) {
  return { keys: [token(), token()], players: [null, null], expiresAt: now + roomMs,
    inviteExpiresAt: now + inviteMs, phase: "lobby", turn: 0, turnId: 0, reveal: 0, end: 0, mission: null, note: "" };
}

function match(room, giver) {
  const source = room.players[giver];
  const target = room.players[1 - giver];
  return source.give.filter(value => target.take.includes(value));
}

function finish(room, note) {
  Object.assign(room, { phase: "ended", note, mission: null });
  for (const player of room.players.filter(Boolean)) {
    player.give = [];
    player.take = [];
  }
}

function nextTurn(room, now, note) {
  if (now >= room.end) return finish(room, "Les 30 minutes sont écoulées.");
  Object.assign(room, { phase: "turn", turn: 1 - room.turn, turnId: room.turnId + 1,
    reveal: now + introMs, mission: null, note });
}

function loseHeart(room, now) {
  const player = room.players[room.turn];
  player.hearts--;
  const note = player.name + " perd un cœur.";
  if (!player.hearts) return finish(room, note + " La partie est terminée.");
  nextTurn(room, now, note);
}

export function tick(room, now) {
  if (room.phase === "lobby" || room.phase === "ended") return false;
  if (room.phase === "active") {
    if (now < room.mission.until) return false;
    nextTurn(room, now, "Mission terminée.");
    return true;
  }
  if (room.phase === "decision" && room.mission.until <= now && room.mission.until <= room.end) {
    loseHeart(room, now);
    return true;
  }
  if (now < room.end) return false;
  finish(room, "Les 30 minutes sont écoulées.");
  return true;
}

function choices(values) {
  const count = zones.length * actions.length;
  if (!Array.isArray(values) || values.length > count ||
    values.some(value => !Number.isInteger(value) || value < 0 || value >= count)) {
    throw new GameError("Les choix transmis sont invalides.", 400);
  }
  return [...new Set(values)];
}

function roll(room, now, pick, exclude = null) {
  const outcomes = match(room, room.turn).flatMap(choice => durations.map(seconds => ({ choice, seconds })))
    .filter(({ choice, seconds }) => choice !== exclude?.choice || seconds !== exclude?.seconds);
  const outcome = outcomes[pick(outcomes.length)];
  Object.assign(room, { phase: "decision", turnId: room.turnId + 1, note: "",
    mission: { ...outcome, reveal: now + rollMs, until: now + rollMs + decisionMs } });
}

export function move(room, slot, body, now, pick = random) {
  const { action } = body;
  const player = room.players[slot];
  const other = room.players[1 - slot];
  if (action === "state") return false;
  if (action === "join") {
    if (player) return false;
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/gu, " ") : "";
    if (!name || [...name].length > 24 || /[\p{Cc}\p{Cf}]/u.test(name)) {
      throw new GameError("Indique un prénom entre 1 et 24 caractères.", 400);
    }
    room.players[slot] = { name, give: [], take: [], saved: false, ready: false, hearts: 3, gems: 2 };
    return true;
  }
  if (action === "renew-invite" && slot === 0 && player && !other && room.phase === "lobby") {
    if (inviteDeadline(room) > now) return false;
    room.keys[1] = token();
    room.inviteExpiresAt = Math.min(now + inviteMs, room.expiresAt);
    return true;
  }
  if (!player || !other) throw new GameError("Les deux prénoms sont nécessaires.");
  if (action === "stop" && room.phase !== "lobby" && room.phase !== "ended") {
    finish(room, player.name + " a arrêté la partie.");
    return true;
  }
  if (room.phase === "lobby" && action === "choices") {
    const give = choices(body.give);
    const take = choices(body.take);
    Object.assign(player, { give, take, saved: true, ready: false });
    other.ready = false;
    return true;
  }
  if (room.phase === "lobby" && action === "ready") {
    if (!player.saved || !other.saved || !match(room, 0).length || !match(room, 1).length) {
      throw new GameError("Il faut au moins un choix compatible dans chaque sens.");
    }
    player.ready = true;
    if (other.ready) {
      Object.assign(room, { phase: "turn", turn: pick(2), turnId: 1,
        reveal: now + introMs, end: now + gameMs });
    }
    return true;
  }
  if (room.turn !== slot || room.turnId !== body.turnId) throw new GameError("Ce tour a déjà changé.");
  if (room.phase === "turn" && action === "roll" && now >= room.reveal) {
    roll(room, now, pick);
    return true;
  }
  if (room.phase === "decision" && now >= room.mission.reveal) {
    if (action === "accept") {
      room.phase = "active";
      room.mission.until = now + room.mission.seconds * 1000;
      return true;
    }
    if (action === "pass") {
      loseHeart(room, now);
      return true;
    }
    if (action === "reroll" && player.gems > 0) {
      roll(room, now, pick, room.mission);
      player.gems--;
      return true;
    }
  }
  throw new GameError("Cette action n’est plus disponible.");
}

export function snapshot(room, slot, now) {
  const me = room.players[slot];
  const other = room.players[1 - slot];
  const mine = room.turn === slot;
  const live = room.phase !== "lobby" && room.phase !== "ended";
  const invite = slot === 0 && !other
    ? { key: room.keys[1], expiresAt: inviteDeadline(room) }
    : null;
  return { me, invite, other: other && { name: other.name, ready: other.ready, saved: other.saved },
    compatible: Boolean(me?.saved && other?.saved && match(room, 0).length && match(room, 1).length),
    phase: live && !mine ? "waiting" : room.phase, turnName: room.players[room.turn]?.name,
    mine, turnId: room.turnId, reveal: room.reveal, end: room.end, now,
    mission: mine ? room.mission : null, note: mine || room.phase === "ended" ? room.note : "" };
}
