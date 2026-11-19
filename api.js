import { createRoom, GameError, inviteDeadline, move, snapshot, tick, token } from "./game.js";

const validToken = value => typeof value === "string" && /^[a-f0-9]{32}$/u.test(value);
export const json = (value, status = 200) => Response.json(value, {
  status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" }
});

function failure(error) {
  if (error instanceof GameError) return json({ error: error.message }, error.status);
  console.error("Erreur HugToYou", error.name);
  return json({ error: "Le salon est momentanément indisponible." }, 500);
}

export async function route(request, dispatch) {
  try {
    if (request.method !== "POST") throw new GameError("Méthode non autorisée.", 405);
    if (request.headers.get("origin") && new URL(request.url).origin !== request.headers.get("origin")) {
      throw new GameError("Origine non autorisée.", 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new GameError("Format de requête invalide.", 415);
    }
    const reader = request.body?.getReader();
    if (!reader) throw new GameError("Requête vide.", 400);
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new GameError("Requête trop longue.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    let body;
    try { body = JSON.parse(text + decoder.decode()); } catch {}
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new GameError("Requête invalide.", 400);
    if (body.action === "create") return await dispatch(token(), body);
    if (!validToken(body.id) || !validToken(body.key)) throw new GameError("Lien de salon invalide.", 404);
    return await dispatch(body.id, body);
  } catch (error) {
    return failure(error);
  }
}

export async function roomApi(id, body, room, save, now = Date.now()) {
  try {
    if (!room && body.action === "create") {
      const created = createRoom(now);
      await save(created);
      return json({ id, key: created.keys[0], invite: created.keys[1] }, 201);
    }
    const directSlot = room?.keys.indexOf(body.key) ?? -1;
    // A retry can recover a join even if its first response never reached the browser.
    const resumed = directSlot < 0 && room?.players[1] && room.keys[1] === body.participantKey;
    const slot = resumed ? 1 : directSlot;
    const invited = slot === 1 && !room.players[1];
    if (slot < 0 || room.expiresAt <= now || (invited && inviteDeadline(room) <= now)) {
      throw new GameError("Ce lien est introuvable ou a expiré.", 404);
    }
    const claiming = invited && body.action === "join";
    if (claiming && (!validToken(body.participantKey) || room.keys.includes(body.participantKey))) {
      throw new GameError("Actualise la page pour rejoindre le salon.", 400);
    }
    let changed = tick(room, now);
    try {
      changed = move(room, slot, body, now) || changed;
      if (claiming) room.keys[1] = body.participantKey;
    } finally {
      if (changed) await save(room);
    }
    const data = { ...snapshot(room, slot, now), needsParticipantKey: invited && !claiming };
    return json(claiming || resumed ? { ...data, participantKey: room.keys[1] } : data);
  } catch (error) {
    return failure(error);
  }
}
