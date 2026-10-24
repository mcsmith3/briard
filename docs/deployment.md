# Deployment variants B–E

The bridge binds `127.0.0.1`. Deployments differ by ingress and identity verification.
[Variant A](../README.md#variant-a--tailscale-serve--person-identity-default) (plain `tailscale serve`)
lives in the README. Security requirements in [docs/security.md](security.md) apply to all shapes.

- [Variant B — identity-aware proxy + per-device authorisation](#variant-b--identity-aware-proxy--per-device-authorisation)
- [Variant C — reverse proxy as the only front door (no Tailscale)](#variant-c--reverse-proxy-as-the-only-front-door-no-tailscale)
- [Variant D — off-host identity proxy over the tailnet](#variant-d--off-host-identity-proxy-over-the-tailnet)
- [Variant E — any other mesh or tunnel (NetBird, ZeroTier, Cloudflare Tunnel)](#variant-e--any-other-mesh-or-tunnel-netbird-zerotier-cloudflare-tunnel)
- [Front doors, one product at a time](#front-doors-one-product-at-a-time): Tailscale, Cloudflare Tunnel,
  Nginx Proxy Manager, NetBird, Caddy
- [Serving Briard under a path](#serving-briard-under-a-path)
- [Several Briard installs on one host](#several-briard-installs-on-one-host)
- [Multiple Briard instances on one host](#multiple-briard-instances-on-one-host)
- [The standby door — a crew's failover path](#the-standby-door--a-crews-failover-path)

Individual devices can also be authorized without a proxy via
[pairing](security.md#pair-a-device--the-write-credential).

---

## Variant B — identity-aware proxy + per-device authorisation

Briard reads an opaque device ID from `BRIARD_DEVICE_HEADER` and checks `BRIARD_DEVICE_ALLOWLIST`.
Allowlisted IDs receive write access; missing or unlisted IDs receive read-only access (terminal
input, uploads, and pane actions are blocked). Pairing is a second gate and always on: every device
also needs a [pairing token](security.md#pair-a-device--the-write-credential) for every `/api` call,
reads included.

Briard configuration (`.env`):

```bash
BRIARD_HOST=127.0.0.1                       # keep loopback (default)
BRIARD_DEVICE_HEADER=X-Device-Id            # the header your proxy injects
# ids allowed to drive agents; others → read-only
BRIARD_DEVICE_ALLOWLIST=my-phone,my-laptop
# only if the proxy does NOT forward the public Host
# BRIARD_ALLOWED_ORIGINS=https://briard.example.com
# REQUIRED unless the proxy forwards a Host Briard already knows: loopback, a
# discovered Tailscale host, or an allowed origin's host
# BRIARD_PUBLIC_HOSTS=briard.example.com
# opt out of Host validation entirely (re-opens DNS rebinding)
# BRIARD_ALLOW_ANY_HOST=1
# BRIARD_TRUSTED_USER still composes on top if your ingress also injects
# Tailscale-User-Login
# accept a request carrying no Tailscale-User-Login at all
# BRIARD_TRUSTED_USER_OPTIONAL=1
```

Proxy requirements:
1. **Authenticate the device** (mTLS, SSO, forward-auth).
2. **Override the device header** on every upstream request to prevent client spoofing.
3. **Proxy to loopback** (`127.0.0.1:$BRIARD_PORT`).
4. **Forward the public `Host` unchanged**, or list the public origin in `BRIARD_ALLOWED_ORIGINS` to
   pass the same-origin check.

Example Nginx configuration:

```nginx
location / {
    proxy_set_header X-Device-Id $device_id;
    proxy_set_header Host        $host;
    proxy_pass http://127.0.0.1:8787;
}
```

Verify header injection and override from an external device. Every `/api` call except
`/api/health` and `/api/pair` needs a pairing token, so pair a terminal first. On the host, run
`briard pair`. It prints an 8-character code. Claim the code from the device you test with. The
`Origin` header must match the public URL. The answer holds the token. Keep it in a shell variable
and never paste it into a file:

```console
$ briard pair                                   # on the host; note the code it prints
$ TOKEN=$(curl -s -X POST https://briard.example.com/api/pair \
    -H 'Content-Type: application/json' -H 'Origin: https://briard.example.com' \
    -d '{"code":"ABCD1234","label":"header-check"}' | jq -r .token)
```

Then run the header check with the token:

```console
$ curl -s -H "Authorization: Bearer $TOKEN" https://briard.example.com/api/snapshot | jq -c .device
{"enforced":true,"device":"header-check","authorized":true}

$ curl -s -H "Authorization: Bearer $TOKEN" -H 'X-Device-Id: not-listed' https://briard.example.com/api/snapshot | jq -c .device
{"enforced":true,"device":"header-check","authorized":true}
```

With a token, `device` names the paired label (`header-check`), not the header value. No field
returns the raw header value any more, so read `authorized`: it is true only when the header the
bridge saw is on `BRIARD_DEVICE_ALLOWLIST` and the token is valid. If the second check returns
`"authorized":false`, the proxy is appending the client's header instead of overriding it. When
you finish, remove the test device with `briard devices revoke header-check`.

Operational notes:
- Direct loopback access (`http://127.0.0.1:$BRIARD_PORT`) sends no header and is read-only, and
  it still needs a pairing token.
- To execute commands locally via curl, pass the token and the header explicitly to loopback:
  `curl -H "Authorization: Bearer $TOKEN" -H 'X-Device-Id: my-laptop' http://127.0.0.1:$BRIARD_PORT/api/...`
- Revoke access by removing the ID from `BRIARD_DEVICE_ALLOWLIST` and restarting (Standalone:
  `bin/briard restart`; Herdr: `herdr plugin action invoke restart --plugin herdr.briard`).
- Do not enable `BRIARD_DEVICE_HEADER` on plain `tailscale serve`; it does not override headers.
- If the proxy runs on another host, see [Variant D](#variant-d--off-host-identity-proxy-over-the-tailnet).

---

## Variant C — reverse proxy as the only front door (no Tailscale)

Use this when running outside Tailscale or behind a dedicated TLS/SSO proxy. `BRIARD_SKIP_SERVE=1`
prevents Briard from managing `tailscale serve`.

The four proxy requirements from [Variant B](#variant-b--identity-aware-proxy--per-device-authorisation)
apply.

Example Caddy configuration:

```caddyfile
briard.example.com {
    reverse_proxy 127.0.0.1:8787 {
        header_up X-Device-Id {your_device_id}
        header_up Host {host}
    }
}
```

Briard configuration (`.env`):

```bash
# proxy is ingress; never run tailscale serve
BRIARD_SKIP_SERVE=1
# REQUIRED — Host validation fails closed, and `briard start` discovers no
# tailnet name here
BRIARD_PUBLIC_HOSTS=briard.example.com
# opt out of Host validation (re-opens DNS rebinding)
# BRIARD_ALLOW_ANY_HOST=1
# exact public origin for the same-origin gate
BRIARD_ALLOWED_ORIGINS=https://briard.example.com
BRIARD_DEVICE_HEADER=X-Device-Id                    # the header your proxy injects…
# …and the ids allowed to drive; others → read-only
BRIARD_DEVICE_ALLOWLIST=my-phone,my-laptop
# optional — status banner, `briard qr`, and the address a lead hands
# joining machines (crew)
# BRIARD_PUBLIC_URL=https://briard.example.com
```

`BRIARD_TRUSTED_USER` has no effect without Tailscale. Per-device headers or the proxy's own auth
serve as the access gate.

### Routing `/auth/` and caching

- Pass `/sw.js` and `index.html` with origin `Cache-Control` (`no-cache`). Do not block static
  assets to unauthenticated clients, or service workers cannot update.
- Route authentication flows under `/auth/*` (or `/cdn-cgi/access/` for Cloudflare Access).
  Service workers bypass caching for `/auth/*`.
- Forward-auth redirects on API requests are treated as 401s to expose the login UI. Authentik
  setups should route `/auth/` to `/outpost.goauthentik.io/start`.
- Without a proxy on `/auth/`, Briard answers `404` there. The page now tells an unpaired device
  to run `briard pair` and enter the code in Settings. It never redirects, because the path
  belongs to your proxy.

```caddyfile
briard.example.com {
    handle /auth/* {
        reverse_proxy 127.0.0.1:9091
    }
    handle {
        forward_auth 127.0.0.1:9091 { ... }
        reverse_proxy 127.0.0.1:8787 { ... }
    }
}
```

Verify the endpoint and caching rules. `$TOKEN` is a pairing token, claimed as in
[Variant B](#variant-b--identity-aware-proxy--per-device-authorisation); `authorized` is true when your
header is allowlisted:

```console
$ curl -s -H "Authorization: Bearer $TOKEN" https://briard.example.com/api/snapshot | jq -c .device
{"enforced":true,"device":"header-check","authorized":true}

$ curl -sI https://briard.example.com/sw.js | grep -i '^cache-control'
cache-control: no-cache
```

---

## Variant D — off-host identity proxy over the tailnet

Use this when routing traffic through a centralized Tailscale ingress node.

![An ingress node authenticates the phone at the tailnet edge, and Briard itself answers only on loopback.](images/deployment/variant-d-off-host-proxy.svg)

The requirements from [Variant B](#variant-b--identity-aware-proxy--per-device-authorisation) apply,
except the proxy targets the host's Tailscale HTTP endpoint instead of loopback.

### Tailscale ACLs (Mandatory)

Because `tailscale serve` forwards client headers without modification, Tailscale ACLs must restrict
direct port access to the ingress node only.

Tailscale / Headscale ≥ 0.29:

```jsonc
"grants": [
  { "src": ["tag:ingress"], "dst": ["tag:agent-host"], "ip": ["tcp:8787"] },
]
```

Headscale ≤ 0.28:

```yaml
acls:
  - action: accept
    src: ["ingress-node"]
    dst: ["agent-host:8787"]
  - action: accept
    src: ["my-phone", "my-laptop"]
    dst: ["agent-host:1-8786", "agent-host:8788-65535"]
```

Briard configuration (`.env`):

```bash
# proxy terminates TLS; this hop is tailnet-internal
BRIARD_SERVE_MODE=http
BRIARD_HOST=127.0.0.1                                 # keep loopback (default)
# header your forward-auth injects — REQUIRED here
BRIARD_DEVICE_HEADER=X-Tailnet-Device
# ids allowed to drive; others + header-less → read-only
BRIARD_DEVICE_ALLOWLIST=my-phone,my-laptop
# REQUIRED — the Host the proxy forwards. BRIARD_TAILSCALE_HOSTS carries the bare
# tailnet name `briard start` found; a rewritten Host is yours to list.
# BRIARD_ALLOW_ANY_HOST=1 opts out.
BRIARD_PUBLIC_HOSTS=host:8787,host.your-tailnet.ts.net:8787
# the public origin the browser actually uses
BRIARD_ALLOWED_ORIGINS=https://briard.example.com
```

`BRIARD_TRUSTED_USER` matches the identity of the ingress node, not the end user behind it.

Verification:

From a non-ingress tailnet peer. `$TOKEN` is a pairing token, claimed as in
[Variant B](#variant-b--identity-aware-proxy--per-device-authorisation):

```console
$ curl -s -H "Authorization: Bearer $TOKEN" https://briard.example.com/api/snapshot | jq -c .device
{"enforced":true,"device":"header-check","authorized":true}

$ curl -s --max-time 10 -H 'X-Tailnet-Device: my-phone' http://host.your-tailnet.ts.net:8787/api/snapshot
curl: (28) Connection timed out
```

On the agent host, a request sends no header, so `authorized` is false even with a valid token:

```console
$ curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/api/snapshot | jq -c .device
{"enforced":true,"device":"header-check","authorized":false}
```

---

## Variant E — any other mesh or tunnel (NetBird, ZeroTier, Cloudflare Tunnel)

Point the tunnel/proxy to `127.0.0.1:$BRIARD_PORT`.

Briard configuration (`.env`):

```bash
BRIARD_SKIP_SERVE=1                                 # never run tailscale serve
# REQUIRED — exact public host; Host validation fails closed and finds no
# tailnet name here
BRIARD_PUBLIC_HOSTS=briard.example.com
# exact public origin for the same-origin gate
BRIARD_ALLOWED_ORIGINS=https://briard.example.com
```

Rules:
1. Apply [Variant B](#variant-b--identity-aware-proxy--per-device-authorisation) proxy rules.
2. `BRIARD_TRUSTED_USER` is inactive without Tailscale. Use `BRIARD_DEVICE_HEADER` or the tunnel's auth.
3. Use a static hostname so PWA caching and `BRIARD_PUBLIC_HOSTS` remain valid.

---

## Front doors, one product at a time

Rough setups for the front doors people ask about. Each one ends at the same place: HTTPS on one
fixed hostname, forwarded to `127.0.0.1:$BRIARD_PORT` on this host.

> **Note.** Web Push, the microphone and the home screen install need HTTPS with a certificate
> the phone trusts. Over plain HTTP, Briard still reads and replies in a browser tab, and those
> three stay off ([Voice input and Web Push](voice-and-push.md)).

Every front door except Tailscale uses the same three lines in Briard's `.env`, then a restart:

```bash
BRIARD_SKIP_SERVE=1                                 # you own the door, not Briard
BRIARD_PUBLIC_HOSTS=briard.example.com              # the hostname the phone opens
BRIARD_ALLOWED_ORIGINS=https://briard.example.com   # the same, as an origin
```

Run the proxy or tunnel on the same host as Briard. Briard refuses a connection that does not
come from loopback, so a proxy on another machine needs
[Variant D](#variant-d--off-host-identity-proxy-over-the-tailnet) instead.

Then pair the phone with `briard pair`. None of these doors knows which device may type; pairing
does ([Pair a device](security.md#pair-a-device--the-write-credential)).

| Door | Private by default | HTTPS certificate | Extra step |
| --- | --- | --- | --- |
| Tailscale | yes, tailnet only | Tailscale issues it | enable HTTPS certificates once |
| Cloudflare Tunnel | **no, public** | Cloudflare issues it | Cloudflare Access login in front |
| Nginx Proxy Manager | depends on the host | Let's Encrypt | host networking for the container |
| NetBird | yes, mesh only | none of its own | a proxy on the host, DNS challenge |
| Caddy | depends on the host | Let's Encrypt, automatic | a DNS plugin for a private name |

### Tailscale

The default, and the only door Briard manages itself: `briard start` runs `tailscale serve` on
your MagicDNS name.

1. In the Tailscale admin console, open **DNS**, turn on MagicDNS, then **Enable HTTPS**.
2. Start Briard, which publishes itself on the tailnet.

   ```bash
   briard start
   ```

3. Set `BRIARD_TRUSTED_USER` to your tailnet login in `.env`, then restart.

   ```bash
   briard restart
   ```

[Variant A](../README.md#variant-a--tailscale-serve--person-identity-default) has the rest.
Do not set `BRIARD_SKIP_SERVE` for this door.

> **Never** use `tailscale funnel`. Funnel puts the port on the public internet.

### Cloudflare Tunnel

`cloudflared` dials out to Cloudflare, so no port opens on your router. The hostname is public,
so a login has to stand in front of it.

1. Log in, create a tunnel, and point a hostname at it.

   ```bash
   cloudflared tunnel login
   cloudflared tunnel create briard
   cloudflared tunnel route dns briard briard.example.com
   ```

2. Write `~/.cloudflared/config.yml` with the tunnel id `create` printed.

   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /home/you/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: briard.example.com
       service: http://127.0.0.1:8787
     - service: http_status:404
   ```

3. Install it as a service with that config, so it survives a reboot.

   ```bash
   sudo cloudflared --config ~/.cloudflared/config.yml service install
   ```

4. In Cloudflare Zero Trust, add a **self-hosted application** for `briard.example.com`, with a
   policy that lets in your email only.

A tunnel made in the Zero Trust dashboard works too: set its public hostname's service to
`http://127.0.0.1:8787`. `cloudflared` forwards the public hostname as `Host`, which is what
`BRIARD_PUBLIC_HOSTS` expects.

> **Warning.** Without step 4, anyone who finds the hostname gets a shell on your machine.
> Cloudflare Access is the door's lock; pairing then decides which device may type.

5. Make Briard check the lock. In the Access application, copy the **Application Audience (AUD)
   tag**. Add it and your team name to `.env`, then restart.

   ```bash
   BRIARD_ACCESS_TEAM=myteam          # from myteam.cloudflareaccess.com
   BRIARD_ACCESS_AUD=<the AUD tag>
   ```

   Every request through the tunnel must now carry a token that Cloudflare signed for this
   application. If the Access app is deleted, gets a bypass rule, or has not reached every edge yet,
   Briard refuses the request instead of showing the panes. The audience check matters: every Access
   app in a team signs with the same key, so a token for another app is refused too.

   Briard fetches the team's public keys at start and every hour. Until the first fetch works,
   every remote request gets `503`. If a later fetch fails, Briard keeps the keys it has. Set both
   lines or neither: one alone refuses every remote request. Either way the bridge log names the
   problem in one line, so check the log after the restart.

   Only a process on this machine skips the token: a request to `127.0.0.1` or `localhost` that
   carries no `Cf-*` and no forwarding header (`X-Forwarded-For`, `X-Forwarded-Host`,
   `X-Forwarded-Proto`, `Forwarded`, `X-Real-Ip`). It still needs pairing to type. `/api/health`
   and the crew links do not need a token either. `briard doctor` is such a local caller, so a green
   doctor does not show that the keys loaded or that a token verifies. Open the hostname from the
   phone to check that.
   [ADR 0081](../.adr/0081-a-front-doors-signed-identity-is-verified-cloudflare-access-is-the-first-preset.md) has the reasons.

   Keep these rules with the gate on:

   - **One front door at a time.** With Access on, a request through `tailscale serve`, Caddy or
     Traefik needs a token too, because they add a forwarding header by default.
     A machine that serves both a tunnel and a tailnet name (`tailscale serve`) loses the tailnet
     door for browsers: those requests carry no Access token and get `401`.
   - **No second proxy between `cloudflared` and Briard that makes requests look local.** One that
     rewrites `Host` to `127.0.0.1` or `localhost` and removes the `Cf-*` and forwarding headers
     does it on purpose. A bare nginx `proxy_pass http://127.0.0.1:8787` does it by default: it
     sends `Host: 127.0.0.1:8787` and adds no forwarding header unless you configure one. Those
     requests skip the token. Point `cloudflared` at Briard directly.
   - **Do not add Access bypass rules for Briard paths**, not for the manifest, the service worker
     or the icons. Access adds the token to every request it lets through. A bypassed path carries
     no token, so Briard answers `401`.

Access redirects to `/cdn-cgi/access/` to log in. Keep `sw.js` and `index.html` uncached, as
[Routing `/auth/` and caching](#routing-auth-and-caching) says.

### Nginx Proxy Manager

A reverse proxy with a web UI and Let's Encrypt built in. It runs in Docker, and inside a
container `127.0.0.1` is the container, not your host.

1. Give the container the host's network, so it can reach Briard on loopback.

   ```yaml
   services:
     npm:
       image: jc21/nginx-proxy-manager:latest
       network_mode: host
       volumes:
         - ./data:/data
         - ./letsencrypt:/etc/letsencrypt
   ```

2. Open the UI on port 81 and add a **Proxy Host**: domain `briard.example.com`, scheme `http`,
   forward to `127.0.0.1`, port `8787`.
3. On the **SSL** tab, request a Let's Encrypt certificate and turn on **Force SSL**.

Leave **Cache Assets** off, so the service worker can update. Briard polls over plain HTTP, so the
**Websockets Support** switch does not matter.

For a name that only resolves inside your network, pick **Use a DNS Challenge** on the SSL tab.
Let's Encrypt cannot reach a private host over HTTP.

> **Warning.** `host.docker.internal` with `host-gateway` does not work here. It reaches the
> Docker bridge address, and Briard listens only on `127.0.0.1`.

If the proxy is open to the internet, add an **Access List** to the proxy host, or keep ports
80 and 443 closed on the router and reach the host over a VPN.

### NetBird

NetBird is a WireGuard mesh, like a tailnet. It carries the traffic, and a reverse proxy on the
host adds HTTPS.

1. Join the host and the phone to the same NetBird network.

   ```bash
   netbird up
   ```

2. Point a DNS record for `briard.example.com` at the host's NetBird address (`100.x.y.z`).
3. Run Caddy on the host, bound to that address, with a DNS challenge certificate.

   ```caddyfile
   briard.example.com {
       bind 100.x.y.z
       tls {
           dns cloudflare {env.CF_API_TOKEN}
       }
       reverse_proxy 127.0.0.1:8787
   }
   ```

The DNS challenge proves you own the domain without Let's Encrypt reaching the host, so the name
can point at a private address. Caddy needs the DNS plugin for your provider, for example
`xcaddy build --with github.com/caddy-dns/cloudflare`.

A NetBird peer name such as `host.netbird.cloud` has no publicly trusted certificate, so use a
domain you own. The same recipe fits ZeroTier or any other mesh.

### Caddy

Caddy gets and renews its own certificate. On a host that is reachable on ports 80 and 443, this
is the whole config:

```caddyfile
briard.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

For a private name, add the `tls { dns … }` block from [NetBird](#netbird) above. A public host
also needs a login in front, as in [Variant C](#variant-c--reverse-proxy-as-the-only-front-door-no-tailscale).

---

## Serving Briard under a path

One release build serves any mount. Set the path in the instance `.env` (or `[serve] base_path` in
`config.toml`), restart, and the bridge serves the app, its assets and `/api/*` under that path:

```bash
# https://<your-node>/briard/ — leading and trailing slash both optional; the bridge adds them
BRIARD_BASE_PATH=/briard
```

Accepted: `/briard`, `briard/`, `/apps/briard/`. Refused, with one line in the log and the root
used instead: a `.` or `..` segment, whitespace, `?`, `#`. `briard doctor` prints the mount on
its `front-door` line.

With the default front door, `briard serve` (and every `briard start`) publishes
`tailscale serve --set-path=/briard/` instead of the root, so another app can keep `/` on the same
node. Tailscale strips the mount before it proxies, and the bridge also accepts a request that still
carries it, so a reverse proxy works either way. To check yours:

```bash
curl -s https://<your-node>/briard/api/health   # JSON, not HTML, means the mount is right
```

Behind your own proxy ([Variant C](#variant-c--reverse-proxy-as-the-only-front-door-no-tailscale)),
mount the bridge at the same path. Caddy: `handle_path /briard/* { reverse_proxy 127.0.0.1:8787 }`.
Nginx: `location /briard/ { proxy_pass http://127.0.0.1:8787/; }`. If you set `BRIARD_PUBLIC_URL`,
include the path: `https://briard.example.com/briard/`.

**A mount change is a new app on the phone.** The installed PWA's scope and identity are the path it
was installed from. After changing `BRIARD_BASE_PATH`, or moving back to the root, remove the
home-screen icon and add it again from the new address; the old one keeps pointing at a path the
bridge no longer serves. The bridge itself needs only a restart, and `briard serve` moves the door
on its own: it tears down the mapping its record names before it publishes the new one.

---

## Several Briard installs on one host

To host independent instances per user on a shared system ([ADR 0001](../.adr/0001-one-managed-front-door.md)):

```bash
# ~/.config/herdr/plugins/config/herdr.briard/.env — one per Unix user
# this user's loopback bridge port — unique per user
BRIARD_PORT=8801
# this user's tailnet https listener — unique per user
BRIARD_SERVE_PORT=8443
BRIARD_TRUSTED_USER=dev-a@example.com  # only this tailnet login may drive these agents
```

Standalone binary URL check: `bin/briard url`. Herdr plugin URL check:
`herdr plugin action invoke url --plugin herdr.briard`.

Requirements:
- Run distinct Unix users and separate instances of `herdr`/Briard.
- Always set `BRIARD_TRUSTED_USER` to restrict access per port.
- Initial Tailscale bindings require operator setup: run `bin/briard serve` (or Herdr equivalent)
  with operator privileges.

`BRIARD_SERVE_PORT` sets the entry port for an instance. `BRIARD_INSTANCE` creates an isolated
instance with its own service unit and config on the same host
([Multiple Briard instances on one host](#multiple-briard-instances-on-one-host)).

---

## Multiple Briard instances on one host

Use this setup to run a second, distinct Briard on the same machine. Examples include running a
stable release alongside a working copy, or running a second multiplexer (`tmux`/`zellij`) next to
the Herdr-managed default. Each instance gets a dedicated port, config, state directory, and
service unit. This differs from [Several Briard installs on one host](#several-briard-installs-on-one-host), which
allocates one instance per Unix user. Here, one user runs multiple instances.

### Create the second instance

Set `BRIARD_INSTANCE=<name>` to name the instance. The name must match `[a-z0-9-]{1,16}`. A named
instance also requires an explicit `BRIARD_PORT`. The CLI exits with an error if this port is
missing; it infers no default value.

Create `~/.config/herdr/plugins/config/herdr.briard-<name>/.env`:

```bash
BRIARD_INSTANCE=<name>        # required — [a-z0-9-], max 16 chars
BRIARD_PORT=8788              # required for a named instance — no default is inferred
# Unset, this defaults to ~/.local/state/briard, with no instance suffix
BRIARD_STATE_DIR=/home/you/.local/state/briard-<name>
```

`BRIARD_INSTANCE`, `BRIARD_PORT`, and `BRIARD_STATE_DIR` can all reside in that `.env` file. The
merged environment resolves the instance. `HERDR_PLUGIN_CONFIG_DIR` overrides the directory where
the CLI searches for configuration.

### Run a service unit per instance

`briard start` writes the unit when the environment sets the instance. The operator does not write
it by hand. On macOS it writes a launchd plist under `~/Library/LaunchAgents/` instead. The unit
sets `BRIARD_PORT`, `BRIARD_INSTANCE`, `BRIARD_PLUGIN_ROOT`, `HERDR_PLUGIN_CONFIG_DIR`, and
`EnvironmentFile=-<config dir>/.env`. `--instance <name>` on `ExecStart` exists solely so two
instances that share one binary can distinguish their bridges (`cli/unit.ts` `systemdUnit()`):

```ini
ExecStart=<root>/bin/briard _exec-bridge --instance <name>
Environment=BRIARD_PORT=8788
Environment=BRIARD_INSTANCE=<name>
Environment=BRIARD_PLUGIN_ROOT=<root>
Environment=HERDR_PLUGIN_CONFIG_DIR=<config dir>
EnvironmentFile=-<config dir>/.env
```

The CLI maintains a per-instance `tailscale serve` handler file, so running `unserve` on one
instance does not delete the mapping for another.

### Target a named instance from the CLI

Every CLI verb (`pair`, `devices`, `url`, `qr`, `crew …`, `logs`, `push-test`, …) resolves its
target instance from the process environment. Set `BRIARD_INSTANCE` before invoking the verb:

```bash
BRIARD_INSTANCE=next bin/briard pair
BRIARD_INSTANCE=next bin/briard devices list
```

Without `BRIARD_INSTANCE`, the CLI queries Herdr. Herdr tracks only the unsuffixed plugin, so the
command executes against the first instance. Always set `BRIARD_INSTANCE` explicitly when running
multiple instances on one host to avoid modifying the wrong instance.

### The refusal rule

If `BRIARD_INSTANCE` is set but `herdr.briard-<name>/.env` is missing, the CLI exits with an error.
It does not fall back to another instance's configuration.

### Pairing is per instance

`briard pair` writes a pairing code to that instance's state directory. The QR it prints encodes
that instance's own URL, since each instance has its own state directory and, via
`BRIARD_PUBLIC_URL` or its own port, its own front door. Open that instance's specific URL on the
phone and enter the code under Settings → System → Paired devices. A code minted for one instance cannot
pair a device to any other instance
([Pair a device](security.md#pair-a-device--the-write-credential)).

---

## The standby door — a crew's failover path

For [crew](../CREW_PROTOCOL.md) deployments. Configures a pre-authorized deputy to take over if the
lead becomes unreachable ([ADR 0027](../.adr/0027-the-deputy-is-named-ahead-of-time.md),
[ADR 0028](../.adr/0028-the-standby-door-is-a-second-listener.md),
[`CREW_PROTOCOL.md` §18](../CREW_PROTOCOL.md)).

Deputy and lead settings:

| Key | Default | What it does |
| --- | --- | --- |
| `BRIARD_STANDBY_PORT` | *(unset)* | Port for the standby listener. Unset disables the standby door. Must match on lead and deputy. |
| `BRIARD_STANDBY_HOST` | `127.0.0.1` | Bind address (`127.0.0.1` for local proxies, overlay IP for remote). |
| `BRIARD_STANDBY_ARM_MS` | `max(30000, 2.5 × BRIARD_POLL_IDLE_MS)` | Lead silence duration required before arming. |

Set `BRIARD_STANDBY_PORT` to an identical, unused port on both the lead and deputy.

### The prerequisite: one hostname, two backends

Lead and deputy must be served from the same origin to share the PWA registration and device
credentials. A standalone crew without unified ingress recovers via `bin/briard promote` (or Herdr:
`herdr plugin action invoke promote --plugin herdr.briard`; [`CREW_PROTOCOL §14.4`](../CREW_PROTOCOL.md)).

Example Traefik configuration:

```yaml
http:
  routers:
    briard:
      rule: "Host(`briard.example.com`)"
      service: briard-crew
      tls: {}

  services:
    briard-crew:
      failover:
        service: briard-lead
        fallback: briard-deputy

    briard-lead:
      loadBalancer:
        servers:
          - url: "http://lead.internal:8787"
        healthCheck:
          path: /standby/health
          interval: 5s
          timeout: 2s

    briard-deputy:
      loadBalancer:
        servers:
          - url: "http://deputy.internal:8788"   # BRIARD_STANDBY_PORT
        healthCheck:
          path: /standby/health
          interval: 5s
          timeout: 2s
```

Health check responses: lead returns `200` (non-`200` when deposed); deputy returns `503` until
armed, then `200`.

### Set it up once, while everything is healthy

Standalone setup on the lead:

```bash
bin/briard pair
bin/briard crew deputy nas
bin/briard crew status
```

Herdr setup on the lead:

```bash
herdr plugin action invoke pair --plugin herdr.briard
herdr plugin action invoke crew --plugin herdr.briard deputy nas
herdr plugin action invoke crew --plugin herdr.briard status
```

On the deputy, configure `BRIARD_STANDBY_PORT=8788` and restart. Ensure all peers restart to load
the deputy warrant. Verify at `https://briard.example.com/standby`.

### ⚠️ The deputy must be supervised

During takeover, the deputy writes state and exits with status code `75` (`EX_TEMPFAIL`) to trigger a
process restart ([`bridge/index.ts`](../bridge/index.ts)).

Ensure the supervisor restarts on non-zero exit codes (systemd: `Restart=always` or
`Restart=on-failure`).

### The bad day — the runbook

1. Open `https://briard.example.com`.
2. When the lead is unhealthy, proxy routes to `/standby`.
3. Review deputy standby status.
4. Select **Take over**.
5. The deputy verifies peer consensus, applies the warrant, and exits `75`.
6. Supervisor restarts the process; PWA reloads as the new lead.

Post-recovery:
- The previous lead deposes itself upon reconnecting ([`CREW_PROTOCOL.md` §8.4](../CREW_PROTOCOL.md)).
- Update the deposed node's peer address: Standalone `bin/briard crew set-address <member> <host:port>`
  or Herdr `herdr plugin action invoke crew --plugin herdr.briard set-address <member> <host:port>`.
- Assign a new deputy: Standalone `bin/briard crew deputy <member>` or Herdr
  `herdr plugin action invoke crew --plugin herdr.briard deputy <member>`.
- Do not run `crew rotate` until all members have reconnected.

---

[← back to the README](../README.md)
