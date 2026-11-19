import { DurableObject } from "cloudflare:workers";
import { route, roomApi } from "./api.js";

export class Room extends DurableObject {
  async fetch(request) {
    const { id, body } = await request.json();
    return this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get("room");
      return roomApi(id, body, room, async next => {
        if (!room) await this.ctx.storage.setAlarm(next.expiresAt);
        await this.ctx.storage.put("room", next);
      });
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== "/api") return env.ASSETS.fetch(request);
    return route(request, (id, body) => env.ROOMS.getByName(id).fetch("https://room.internal", {
      method: "POST", body: JSON.stringify({ id, body })
    }));
  }
};
