// Worker: /api/submit (visitor) -> queue; /api/next + /api/ack (kiosk).
const KIOSK_KEY = "change-me"; // kiosk must send ?key=... (use `wrangler secret` for real use)

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const q = env.QUEUE.get(env.QUEUE.idFromName("main"));
    if (url.pathname === "/api/submit" && req.method === "POST") {
      const info = await req.json();
      info.ip = req.headers.get("CF-Connecting-IP");
      info.city = req.cf?.city; info.country = req.cf?.country;
      info.time = new Date().toISOString();
      return q.fetch("https://q/push", { method: "POST", body: JSON.stringify(info) });
    }
    if (url.pathname.startsWith("/api/") && url.searchParams.get("key") !== KIOSK_KEY)
      return new Response("forbidden", { status: 403 });
    if (url.pathname === "/api/next") return q.fetch("https://q/next");
    if (url.pathname === "/api/ack") return q.fetch("https://q/ack?id=" + url.searchParams.get("id"), { method: "POST" });
    return new Response("not found", { status: 404 });
  },
};

export class Queue {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const p = new URL(req.url);
    const items = (await this.state.storage.get("items")) || [];
    if (p.pathname === "/push") {
      items.push({ id: crypto.randomUUID(), data: await req.json() });
      await this.state.storage.put("items", items.slice(-100));
      return new Response("ok");
    }
    if (p.pathname === "/next") return Response.json(items[0] || null);
    if (p.pathname === "/ack") {
      await this.state.storage.put("items", items.filter(i => i.id !== p.searchParams.get("id")));
      return new Response("ok");
    }
  }
}
