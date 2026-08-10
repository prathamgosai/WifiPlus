# WifiPlus — Edge Measurement Server

A real, self-hostable measurement backend for the WifiPlus speed test. It streams
uncached random payloads for the download test, sinks upload blobs, and echoes
latency/packet-loss probes over HTTP and WebSocket. Deploy **one instance per
region** and the frontend will pick the nearest healthy one automatically.

> **What this is and isn't.** This is complete, working, tested server code.
> What it is *not* is a way to conjure servers in seven cities — that's infra you
> provision. Until you deploy it, the app measures against **Cloudflare's public
> edge** (itself a real 300-city anycast network), so the test works with zero
> backend. Every value the server produces is measured from real bytes; nothing
> is simulated.

---

## Endpoints

Everything is served under `/api/speedtest`, and **also at the bare path** shown
below. Both are the same route definitions registered twice, not two
implementations — edges already deployed in the field are addressed by the old
shape, and the client picker discovers whichever one a host answers on.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/speedtest/servers` | The registry of edges a client may measure against. |
| `GET` | `/api/speedtest/health` | Region, uptime, normalised CPU load, memory — used by the picker. |
| `GET` | `/api/speedtest/meta` | Observed client IP + version, negotiated HTTP protocol. |
| `GET` | `/api/speedtest/ping` | Tiny uncached clock echo — latency / jitter. |
| `WS` | `/api/speedtest/ws/ping` | Stateless echo socket — packet loss on a live channel. |
| `GET` | `/api/speedtest/download?bytes=N` | Streams exactly N bytes of uncompressible random data. |
| `POST` | `/api/speedtest/upload` | Drains a binary body (no buffering) and returns bytes + Mbps. |
| `GET` | `/api/speedtest/dns` | Times a genuine cold recursive lookup **from this server**. |

`/servers` always advertises this instance, so a single-region deployment needs no
extra configuration. Add siblings with the `PEERS` env var. This server never
probes its peers: its latency to Singapore says nothing about a browser's, so
ranking is done by the client, which measures every candidate itself.

`/dns` measures **this server's** resolver, not the visitor's — a browser cannot
time its own OS resolver, and no API exposes it. The DNS figure the app displays
therefore stays a client-side DNS-over-HTTPS measurement, which at least travels
the user's own network path. This route answers the operator's question ("is this
edge resolving healthily"), and its response is labelled `"scope": "server"` so it
cannot be mistaken for the visitor's DNS.

**Anti-cheat is built in:** `Cache-Control: no-store`, `Content-Encoding: identity`,
high-entropy payloads (uncompressible), and per-request cache-busters. Put `gzip off`
and `proxy_buffering off` in front (see `nginx/`) so a proxy can't distort timing.

---

## Run it

```bash
cd server
cp .env.example .env         # set REGION / SERVER_NAME / ALLOWED_ORIGINS
npm install
npm run dev                  # http://localhost:8080  (watch mode)

npm run typecheck            # strict TS, no errors
npm test                     # 8 in-process integration tests (fastify.inject)
npm start                    # production (runs via tsx)
```

### Docker (per region)

```bash
docker compose up -d --build
# or the raw image:
docker build -t wifiplus/speedtest-server .
docker run -d --env-file .env -p 8080:8080 wifiplus/speedtest-server
```

### PM2 (bare metal / VM)

```bash
npm ci
pm2 start ecosystem.config.cjs --env production   # cluster mode, one worker per core
```

### In front of it

- **NGINX** — `nginx/wifiplus-speedtest.conf` terminates TLS, speaks HTTP/2, proxies
  to `:8080`, disables gzip/buffering on the hot path, and upgrades `/ws/`.
- **Cloudflare** — put the region hostname behind Cloudflare (proxied) to get
  **HTTP/3 / QUIC** to the browser for free. Turn **off** "Auto Minify" and any
  caching rule for `/download` and `/upload`. The origin can stay HTTP/1.1 — the
  bytes are still real end to end.
- **TLS** — `certbot --nginx -d bom.speed.wifiplus.example`.

---

## Connect the frontend to your servers

Once deployed, register them so the picker uses them instead of Cloudflare. Set an
env var on the Next.js app (`web/`):

```bash
# web/.env.local — JSON array of your deployed edges
NEXT_PUBLIC_WIFIPLUS_SERVERS='[
  {"id":"bom","name":"Mumbai","country":"India","city":"Mumbai","url":"https://bom.speed.example.com","lat":19.07,"lon":72.87},
  {"id":"sin","name":"Singapore","country":"Singapore","city":"Singapore","url":"https://sin.speed.example.com","lat":1.35,"lon":103.8}
]'
```

The static site at the repo root has no build step, so it cannot read an env var.
It reads the same registry off the page instead — declare it before `app.js`:

```html
<script>
  window.WIFIPLUS_SERVERS = [
    { id: "bom", name: "Mumbai", country: "India", city: "Mumbai", url: "https://bom.speed.example.com" }
  ];
</script>
```

Either way the picker (`core/server-picker.js`, shared by both front ends) probes
every server's `/ping` + `/health`, ranks them by the latency it **measures** —
never by the city label — and measures against the fastest. With nothing
configured it returns Cloudflare immediately, making no requests at all, so the
default path pays nothing for the capability.

Selection is bounded: each probe times out after 1.2s and the whole phase after
2.5s, so a registry full of dead hosts costs about a second rather than the sum
of every timeout. Every phase then falls through the ranked list, with Cloudflare
always last — a broken upload route on your edge costs the upload figure, not the
run, and a run can always complete against something.

> **CSP — do this or nothing will work.** `connect-src` is pinned to Cloudflare in
> **three** places, and every one of them must list your edge origins:
>
> - `web/public/_headers` — the `Content-Security-Policy` line (Next.js app)
> - `index.html` — the `<meta http-equiv="Content-Security-Policy">` tag (static site)
> - `_headers` at the repo root — if you add a `connect-src` there
>
> Miss one and the browser blocks every request to your server. The failure is
> silent by design: a CSP block surfaces to `fetch` as an ordinary network error,
> so the picker cannot tell it apart from a host that is down. It marks the edge
> unreachable and falls back to Cloudflare — the test still works, you just never
> measure against your own server and nothing says why. If a freshly deployed edge
> is never selected, check the browser console for a CSP violation before
> suspecting the server.

---

## Regions to deploy (from the brief)

Mumbai · Delhi · Bangalore · Singapore · Tokyo · Frankfurt · London · Dubai ·
Sydney · Virginia · California. One instance each, on a host physically in that
region (a VM/container from any cloud with a presence there). The image is
identical; only `REGION`/`SERVER_NAME`/`CITY` differ.

## Accuracy

Streaming real uncompressible bytes against a nearby edge, with warm-up discarded
and multiple parallel streams, is the same method Cloudflare's and LibreSpeed's
tests use — results land in the same ballpark as Ookla/Fast.com on the same link.
The dominant accuracy factor is **server proximity and capacity**: a well-provisioned
edge in the user's city is what closes the last few percent, which is exactly why
the multi-region deploy matters.

## Tests & CI

`npm test` drives the real app in-process via `fastify.inject()` — same routing,
parsing and streaming as production, no port bound. GitHub Actions runs typecheck +
tests on every change to `server/**` (`.github/workflows/server-ci.yml`).
