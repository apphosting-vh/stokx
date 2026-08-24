/*
   Cloudflare Worker — private CORS reverse-proxy for this app.

   SETUP (~5 min):
   1. Create free account: https://dash.cloudflare.com/sign-up
   2. Dashboard → Workers & Pages → Create → Create Worker → name it (e.g. "stock-proxy") → Deploy
   3. Click "Edit code", delete everything, paste this entire file, click Deploy.
   4. Your endpoint is: https://stock-proxy.<your-subdomain>.workers.dev/?url=<encoded-url>
   5. Test in browser:
      https://stock-proxy.<your-subdomain>.workers.dev/?url=https%3A%2F%2Fquery1.finance.yahoo.com%2Fv8%2Ffinance%2Fchart%2FRELIANCE.NS%3Finterval%3D1d%26range%3D1d
      → should print JSON chart data.
   Free tier: 100,000 requests/day, no credit card.

   SECURITY: only the 4 data hosts below are proxied — the Worker cannot be
   abused as an open proxy by strangers.
*/

const ALLOWED_HOSTS = [
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "www.nseindia.com",
  "stooq.com",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const raw = new URL(request.url).searchParams.get("url");
    if (!raw) return jsonError("Missing ?url= parameter", 400);

    let target;
    try { target = new URL(raw); } catch (e) { return jsonError("Invalid url parameter", 400); }
    if (!ALLOWED_HOSTS.includes(target.hostname)) {
      return jsonError("Host not allowed: " + target.hostname, 403);
    }

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "application/json,text/csv,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": target.origin + "/",
        },
      });
    } catch (e) {
      return jsonError("Upstream fetch failed: " + e.message, 502);
    }

    const body = await upstream.arrayBuffer();
    const headers = new Headers(CORS_HEADERS);
    const ct = upstream.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    headers.set("Cache-Control", "no-store");
    return new Response(body, { status: upstream.status, headers });
  },
};

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
  });
}
