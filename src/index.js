// Worker: /api/submit (visitor) -> queue; /api/next + /api/ack (kiosk).
// The kiosk must send ?key=... matching the KIOSK_KEY Worker secret (set with `wrangler secret put KIOSK_KEY`).

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
      // Optional geofence: set ALLOWED_REGIONS (e.g. "US-CO" or "US-CO,US-WY") as a Worker variable to enable.
      if (env.ALLOWED_REGIONS) {
        const here = cf.country + "-" + cf.regionCode;
        if (!env.ALLOWED_REGIONS.split(",").map(x => x.trim().toUpperCase()).includes(here.toUpperCase()))
          return new Response("not available in your area", { status: 403 });
      }
      // Real visitors run the page in a normal browser; drop scripted/headless clients.
      const ua = req.headers.get("User-Agent") || "";
      if (info.webdriver === true || !info.userAgent || !info.screen || !info.languages ||
          /headless|bot|crawl|spider|curl|python|go-http|wget|java\//i.test(ua))
        return new Response("forbidden", { status: 403 });
      info.ip = req.headers.get("CF-Connecting-IP");
      // One print per visitor per window. Prefer the browser's random visitor id; fall back to IP + fingerprint.
      const rid = typeof info.vid === "string" && info.vid.length <= 64 ? "v:" + info.vid : "f:" + info.ip + ":" + info.fp;
      delete info.vid;
      info.city = cf.city; info.region = cf.region; info.country = cf.country; info.continent = cf.continent;
      info.postal = cf.postalCode; info.lat = cf.latitude; info.lon = cf.longitude; info.ipTimezone = cf.timezone;
      info.asn = cf.asn; info.isp = cf.asOrganization; info.colo = cf.colo;
      info.http = cf.httpProtocol; info.tls = cf.tlsVersion;
      info.time = new Date().toISOString();
      return q.fetch("https://q/push?rid=" + encodeURIComponent(rid), { method: "POST", body: JSON.stringify(info) });
    }
    if (url.pathname.startsWith("/api/") && (!env.KIOSK_KEY || url.searchParams.get("key") !== env.KIOSK_KEY))
      return new Response("forbidden", { status: 403 });
    if (url.pathname === "/api/next") return q.fetch("https://q/next");
    if (url.pathname === "/api/queue") return q.fetch("https://q/list");
    if (url.pathname === "/api/clear" && req.method === "POST") return q.fetch("https://q/clear", { method: "POST" });
    if (url.pathname === "/api/ack") return q.fetch("https://q/ack?id=" + url.searchParams.get("id"), { method: "POST" });
    return new Response("not found", { status: 404 });
  },
};

const LIMIT_MS = 5 * 60 * 1000; // one print per visitor per 5 minutes

export class Queue {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const p = new URL(req.url);
    // One storage key per job (photos make a single array exceed the 128 KiB value limit).
    const st = this.state.storage;
    if (p.pathname === "/push") {
      const now = Date.now(), rk = "r:" + p.searchParams.get("rid");
      const last = await st.get(rk);
      if (last && now - last < LIMIT_MS)
        return Response.json({ error: "rate limited", retry: Math.ceil((LIMIT_MS - (now - last)) / 1000) }, { status: 429 });
      await st.put(rk, now);
      const old = [...(await st.list({ prefix: "r:" })).entries()].filter(([, t]) => now - t >= LIMIT_MS).map(([key]) => key);
      for (let i = 0; i < old.length; i += 128) await st.delete(old.slice(i, i + 128));
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
    if (p.pathname === "/list") {
      // Summaries only: no photos or full payloads.
      const jobs = [...(await st.list({ prefix: "i:" })).entries()].map(([id, d]) => ({
        id, time: d.time, city: d.city, region: d.region, country: d.country,
        userAgent: d.userAgent, model: d.model, camera: d.camera,
      }));
      return Response.json(jobs);
    }
    if (p.pathname === "/clear") {
      const keys = [...(await st.list({ prefix: "i:" })).keys()];
      for (let i = 0; i < keys.length; i += 128) await st.delete(keys.slice(i, i + 128));
      return Response.json({ cleared: keys.length });
    }
    if (p.pathname === "/ack") {
      await st.delete(p.searchParams.get("id"));
      return new Response("ok");
    }
  }
}
