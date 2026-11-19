import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { route, roomApi } from "./api.js";

const rooms = new Map();
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/rules.js", ["rules.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]]
]);
const headers = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

async function handle(request) {
  const path = new URL(request.url).pathname;
  if (path === "/api") return route(request, (id, body) =>
    roomApi(id, body, rooms.get(id), room => rooms.set(id, room)));
  if (!assets.has(path)) return new Response("Page introuvable", { status: 404 });
  const [file, mime] = assets.get(path);
  return new Response(await readFile(new URL("./public/" + file, import.meta.url)), {
    headers: { ...headers, "content-type": mime + "; charset=utf-8" }
  });
}

setInterval(() => {
  for (const [id, room] of rooms) if (room.expiresAt <= Date.now()) rooms.delete(id);
}, 60_000).unref();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);

createServer(async (incoming, outgoing) => {
  try {
    const init = { headers: incoming.headers, method: incoming.method };
    if (!["GET", "HEAD"].includes(init.method)) {
      init.body = Readable.toWeb(incoming);
      init.duplex = "half";
    }
    const origin = "http://" + incoming.headers.host;
    const response = await handle(new Request(origin + incoming.url, init));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end("Erreur HugToYou");
  }
}).listen(port, host, () => console.log("HugToYou est prêt sur http://" + host + ":" + port));
