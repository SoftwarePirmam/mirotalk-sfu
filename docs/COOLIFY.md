# Deploy MiroTalk SFU on Coolify

This guide covers production deployment with Coolify’s Traefik reverse proxy (HTTPS) and direct host publishing for WebRTC media ports.

## Architecture

| Traffic | Path | Notes |
| --- | --- | --- |
| HTTP / HTTPS / WebSockets (signaling) | Internet → Traefik `:443` → container `:8080` | SSL terminates at Traefik |
| WebRTC media (UDP/TCP) | Internet → host `40000–40100` → container | **Not** proxied by Traefik |

Audio/video never goes through Traefik or Cloudflare proxy. Clients connect to `SFU_ANNOUNCED_IP` on the media port range.

## Prerequisites

- Coolify on a Linux host with a public IPv4
- DNS **A** record for your domain pointing to that IPv4
- Firewall / security group open:
  - `80/tcp`, `443/tcp` (Coolify Traefik)
  - `40000–40100/udp` and `40000–40100/tcp` (WebRTC media)

## 1. Create the Coolify resource

1. In Coolify: **New Resource** → **Docker Compose**.
2. Connect this Git repository (or upload the compose project).
3. Set the compose file to `docker-compose.yml`.
4. Ensure Coolify uses the repo `Dockerfile` for the `mirotalksfu` service build.

Do **not** define a custom Docker network that isolates the stack from Coolify’s managed network — Traefik must reach the service.

## 2. Environment variables

In the Coolify resource → **Environment Variables**, set at least:

| Variable | Example | Purpose |
| --- | --- | --- |
| `SERVER_HOST_URL` | `https://meet.example.com` | Public app URL (Coolify domain) |
| `SERVER_LISTEN_IP` | `0.0.0.0` | Bind all interfaces |
| `SERVER_LISTEN_PORT` | `8080` | Internal HTTP port Traefik targets |
| `TRUST_PROXY` | `true` | Trust Traefik `X-Forwarded-*` headers |
| `SFU_ANNOUNCED_IP` | `203.0.113.10` | Server **public** IPv4 for ICE |
| `SFU_MIN_PORT` / `SFU_MAX_PORT` | `40000` / `40100` | Must match compose `ports` |
| `JWT_SECRET` | `openssl rand -hex 32` | Required (≥ 32 chars, not a known default) |
| `API_KEY_SECRET` | strong random string | REST API auth |
| `HOST_PROTECTED` | `false` or `true` | Host login protection |

Use [`.env.example`](../.env.example) as a checklist. You can paste the same keys into Coolify’s UI (preferred) instead of baking a `.env` into the image.

Generate secrets on any machine:

```bash
openssl rand -hex 32
```

### Name mapping (docs vs MiroTalk)

| Concept | MiroTalk variable |
| --- | --- |
| Public URL | `SERVER_HOST_URL` |
| Listen host | `SERVER_LISTEN_IP` |
| Listen port | `SERVER_LISTEN_PORT` |
| Host protection enabled | `HOST_PROTECTED` |
| WebRTC announced IP | `SFU_ANNOUNCED_IP` |

## 3. Domain & Traefik (SSL) in Coolify

1. Open the `mirotalksfu` service in the Coolify resource.
2. Under **Domains**, add your FQDN, e.g. `https://meet.example.com`.
3. Point the domain to **port `8080`** (the container listen port).
4. Leave **HTTPS / Let’s Encrypt** enabled (Coolify default Traefik cert resolver).
5. Deploy / restart so Coolify injects Traefik router + TLS labels.

Coolify generates Host rules and certificates. The compose file already sets:

- `traefik.enable=true`
- `traefik.http.services.mirotalksfu.loadbalancer.server.port=8080`

Socket.IO WebSockets work over Traefik’s HTTP entrypoints — no extra WebSocket middleware is required.

### Manual Traefik labels (optional)

Only if you disable Coolify domain management and edit labels yourself:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.services.mirotalksfu.loadbalancer.server.port=8080
  - traefik.http.routers.mirotalksfu.rule=Host(`meet.example.com`)
  - traefik.http.routers.mirotalksfu.entrypoints=https
  - traefik.http.routers.mirotalksfu.tls=true
  - traefik.http.routers.mirotalksfu.tls.certresolver=letsencrypt
  - traefik.http.routers.mirotalksfu-http.rule=Host(`meet.example.com`)
  - traefik.http.routers.mirotalksfu-http.entrypoints=http
  - traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https
  - traefik.http.routers.mirotalksfu-http.middlewares=redirect-to-https
```

## 4. Firewall & media ports

On the Coolify host (example with UFW):

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 40000:40100/tcp
ufw allow 40000:40100/udp
```

Confirm cloud security groups allow the same ranges.

If media fails (one-way or no video):

1. `SFU_ANNOUNCED_IP` must be the **public** IPv4 (never `172.x` / `10.x` / `192.168.x`).
2. `40000–40100` UDP+TCP must be open end-to-end.
3. Do not put the media ports behind Cloudflare orange-cloud proxy.

Optional: set `SFU_SERVER=true` to use one UDP port per worker (simpler firewall rules; see upstream self-hosting docs).

## 5. Deploy

1. Save environment variables and domain settings.
2. Click **Deploy** in Coolify.
3. Wait for the image build (mediasoup compiles native code on first build).
4. Open `https://meet.example.com` — you should see the MiroTalk SFU UI.

## 6. Security checklist

- [ ] Strong unique `JWT_SECRET` and `API_KEY_SECRET` (not defaults)
- [ ] `TRUST_PROXY=true` only behind Coolify Traefik
- [ ] `SERVER_HOST_URL` uses `https://` and matches the Coolify domain
- [ ] Enable `HOST_PROTECTED=true` + `HOST_USERS` if rooms should require host login
- [ ] Restrict `CORS_ORIGIN` to your domain when possible
- [ ] Do not commit `.env` or Coolify secrets to Git

## 7. Updates

Redeploy from Coolify after pulling newer commits, or trigger a rebuild so the multi-stage `Dockerfile` produces a fresh image. Media port mappings and env vars should stay aligned after upgrades.

## Related

- Upstream self-hosting: [docs/self-hosting.md](./self-hosting.md)
- Full env reference: [`.env.template`](../.env.template)
- Coolify compose pack: https://coolify.io/docs/applications/build-packs/docker-compose
