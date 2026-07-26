/*
  Dedicated Yahoo Finance CORS proxy — deploy this on YOUR OWN Cloudflare
  Workers account (free tier: 100,000 requests/day, no shared rate limit
  with other users). This is what data-fetcher.js's "Proxy Worker" field
  should point to.

  DEPLOY (no CLI needed, ~2 minutes):
  1. Go to https://dash.cloudflare.com  → sign up free if you don't have
     an account.
  2. Left sidebar → Workers & Pages → Create → "Create Worker".
  3. Give it any name (e.g. "stox-proxy") → Deploy.
  4. Click "Edit code" → delete the default template → paste this
     entire file → Save and Deploy.
  5. Copy the *.workers.dev URL Cloudflare gives you (shown at the top,
     e.g. https://stox-proxy.yourname.workers.dev).
  6. Paste that URL into the "Proxy Worker" field in the Nifty 200
     Screener panel and hit Save.

  That's it — the scanner will now route through this instead of the
  shared public proxies whenever it's set.
*/

const ALLOWED_HOSTS = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
]);

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url param" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid url param" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Lock this proxy down to Yahoo Finance only, so it can't be abused as
    // an open relay if the URL ever leaks.
    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    /* Retry transient Yahoo errors server-side so the client never sees
       them — but ONLY real transient failures (network errors, 5xx).
       A 429 means Yahoo has soft-blocked this Worker's egress IP; retrying
       250-500ms later just re-hits the same block and burns another
       request against it, making the block last longer. On 429 we return
       immediately and let the client's own backoff/cooldown decide when
       to try again, instead of quietly multiplying requests into a block
       that hasn't cleared yet. */
    const UA_POOL = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ];
    const MAX_WORKER_RETRIES = 2;
    const RETRY_DELAY_MS = 250;
    const FETCH_OPTS = {
      headers: {
        "User-Agent": UA_POOL[Math.floor(Math.random() * UA_POOL.length)],
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com/",
      },
    };

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_WORKER_RETRIES; attempt++) {
      try {
        const upstream = await fetch(targetUrl.toString(), FETCH_OPTS);
        if (upstream.status >= 500 && attempt < MAX_WORKER_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("content-type") || "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        });
      } catch (e) {
        lastError = e;
        if (attempt < MAX_WORKER_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
      }
    }
    return new Response(JSON.stringify({ error: "Upstream fetch failed: " + String(lastError) }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  },
};
