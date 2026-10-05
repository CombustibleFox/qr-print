// Worker: /api/submit (visitor) -> queue; /api/next + /api/ack (kiosk).
const KIOSK_KEY = "change-me"; // kiosk must send ?key=... (use `wrangler secret` for real use)

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const q = env.QUEUE.get(env.QUEUE.idFromName("main"));
    if (url.pathname === "/api/submit" && req.method === "POST") {
      const body = await req.text();
      if (body.length > 60000) return new Response("too large", { status: 413 });
      let info;
      try { info = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
      if (!info || typeof info !== "object" || Array.isArray(info)) return new Response("bad json", { status: 400 });
      const cf = req.cf || {};
      info.ip = req.headers.get("CF-Connecting-IP");
      info.city = cf.city; info.region = cf.region; info.country = cf.country; info.continent = cf.continent;
      info.postal = cf.postalCode; info.lat = cf.latitude; info.lon = cf.longitude; info.ipTimezone = cf.timezone;
      info.asn = cf.asn; info.isp = cf.asOrganization; info.colo = cf.colo;
      info.http = cf.httpProtocol; info.tls = cf.tlsVersion;
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
    // One storage key per job (photos make a single array exceed the 128 KiB value limit).
    const st = this.state.storage;
    if (p.pathname === "/push") {
      const id = "i:" + Date.now().toString().padStart(15, "0") + crypto.randomUUID().slice(0, 8);
      await st.put(id, await req.json());
      const keys = [...(await st.list({ prefix: "i:" })).keys()];
      if (keys.length > 100) await st.delete(keys.slice(0, keys.length - 100));
      return new Response("ok");
    }
    if (p.pathname === "/next") {
      const [first] = [...(await st.list({ prefix: "i:", limit: 1 })).entries()];
      return Response.json(first ? { id: first[0], data: first[1] } : null);
    }
    if (p.pathname === "/ack") {
      await st.delete(p.searchParams.get("id"));
      return new Response("ok");
    }
  }
}
