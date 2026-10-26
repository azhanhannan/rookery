# Deploying Rookery

Production runs on one DigitalOcean droplet (Basic, 2 GB / 1 vCPU / 50 GB, Singapore, $12/mo) behind
Cloudflare, as three Docker containers. GitHub Actions tests every push and deploys `main`.

```
browser ──https──▶ Cloudflare (proxy + cache for the 44 MB Maia model, engines, bundles)
                      │ https, Origin Certificate ("Full (strict)")
                      ▼
            droplet  ┌──────────────── docker compose (project "rookery") ────────────────┐
            :80/:443 │ web  Caddy 2.10: dist/ as static files, /api/* ─▶ api:5181        │
                     │ api  Node 24 + tsx: Fastify, `prisma migrate deploy` on start     │
                     │ db   Postgres 18, volume pgdata (not published to the host)       │
                     └───────────────────────────────────────────────────────────────────┘

git push main   ─▶ Actions: test ─▶ build api+web images ─▶ GHCR ─▶ ssh deploy.sh <sha> ─▶ smoke test
```

Stockfish and Maia run in the visitor's browser, so the droplet only serves files and a small API. That is
why 1 vCPU is enough; server-side Stockfish review (ROADMAP "Later") would be the reason to resize.

## Files

| File | What it is |
|---|---|
| `Dockerfile` | One build, two targets: `api` (prod deps only) and `web` (Caddy + `dist/`). The build fails if the Maia model or Stockfish didn't make it into `dist/`. |
| `.dockerignore` | Keeps `node_modules`, `.data`, `.env`, downloaded engines/models out of the build context |
| `deploy/compose.yaml` | The production stack. CI copies it to the droplet on every deploy: edit it here. |
| `deploy/Caddyfile` | TLS (Origin Certificate), `/api` proxy, cache headers. Baked into the `web` image. |
| `deploy/.env.example` | Template for `/opt/rookery/.env` on the droplet |
| `deploy/server-setup.sh` | One-time droplet setup: `deploy` user, keys-only SSH, ufw, 2 GB swap, Docker, log rotation, backup cron |
| `deploy/deploy.sh` | Runs on the droplet: pull a tag, back up the DB, `up --wait`, prune. Also the rollback. |
| `deploy/backup.sh` | `pg_dump` to `backups/` (14 days), plus restic off-site when `restic.env` exists |
| `.github/workflows/ci-cd.yml` | test → build → deploy → smoke test |

Code changes that make the container work (all no-ops for `npm run server` in dev):

- `server/src/main.ts`: listens on `HOST` (default `127.0.0.1`; Docker sets `0.0.0.0`); loads
  `embedded-postgres` only when `DATABASE_URL` is unset, so the prod install can omit dev dependencies;
  passes `TRUST_PROXY=1` to Fastify.
- `server/src/app.ts`: `trustProxy` option. Without it every login attempt would come from Caddy's IP and
  the login throttle (`username|ip`) would treat all visitors as one.
- `package.json`: `prisma` and `tsx` moved to `dependencies`: the server runs `prisma migrate deploy` and
  runs under `tsx` in production, so they are runtime dependencies.

## What you need before starting

- A **domain** (or subdomain) on Cloudflare. Use a personal one: Rookery is not an EDESS system.
- A **private GitHub repo** for Rookery — done on 2026-10-23, step 1.
- A DigitalOcean account (personal billing) with your SSH public key added
  (Settings → Security → SSH Keys).

Below, `chess.example.com` is the domain, `203.0.113.10` the droplet IP and `azhanhannan` the GitHub
owner: replace all three.

## 1. Push the repo to GitHub — done 2026-10-23

`https://github.com/azhanhannan/rookery` (private). `origin` is the HTTPS remote, authenticated by
Git Credential Manager, and the default branch is **`main`** — the repo was renamed from `master` on
the same day, which is why the workflow and this document say `main` throughout.

`deploy/docker` is pushed as a branch but **not merged**: merging starts the pipeline, which would
deploy to a droplet that doesn't exist yet. Merging is step 7.

Pre-push checks, for the record: `.env` has never been committed, no blob over 2 MB has ever entered
history (so the Maia model and the 307 MB puzzle CSV stayed out), and no credential patterns appear in
tracked files.

## 2. Create the droplet — done 2026-10-26

Droplet `runcodecloud` (named for the domain, not the app: it may host more `*.runcodecloud.com`
projects later), project `personal`, SGP1, IPv4 `159.223.63.47`, IPv6 off. `runcodecloud.com` DNS moved
from Namecheap BasicDNS to Cloudflare (`jason`/`rachel.ns.cloudflare.com`) the same day; the app's
hostname is `rookery.runcodecloud.com`.


DigitalOcean → Create → Droplets:

| Setting | Value |
|---|---|
| Region | Singapore (SGP1) |
| Image | Ubuntu 24.04 (LTS) x64 |
| Size | Basic → Regular → **$12/mo** (2 GB / 1 CPU / 50 GB SSD / 2 TB transfer) |
| Authentication | SSH Key (yours) — not password |
| Monitoring | On (free: CPU/RAM/disk graphs and alerts) |
| Backups | Optional, +20% ($2.40/mo) weekly. `backup.sh` + restic (step 9) covers the database either way. |
| Hostname | `rookery` |

Note the IPv4 address. Optionally also Networking → Firewalls: allow inbound 22, 80, 443 only (a second
layer on top of ufw; DO's firewall, unlike ufw, also applies to Docker's published ports).

## 3. Run the setup script — done 2026-10-26

First run failed on the apt lock (cloud-init's first-boot apt was still running): on a fresh droplet,
`cloud-init status --wait` before running the script. Verified after: `deploy` can run `docker ps`,
ufw 22/80/443, 2 GB swap, `PasswordAuthentication no`, no reboot pending.


From the repo on your laptop (Git Bash or PowerShell):

```bash
scp deploy/server-setup.sh root@203.0.113.10:/root/
ssh root@203.0.113.10 bash /root/server-setup.sh
```

It upgrades packages, enables unattended security updates, creates user `deploy` with the same SSH key,
turns off SSH passwords, opens 22/80/443 in ufw, adds 2 GB swap, installs Docker, rotates container logs,
creates `/opt/rookery/{certs,backups}` and a nightly backup cron (19:30 UTC = 03:30 MYT; the droplet clock is UTC).

Check you can log in as `deploy` **before** closing the root session:

```bash
ssh deploy@203.0.113.10 docker ps     # empty table, no permission error
```

## 4. Cloudflare: DNS, TLS, cache

1. **DNS** → Add record: `A`, name `chess`, IPv4 `203.0.113.10`, **Proxied (orange cloud)**.
2. **SSL/TLS → Overview**: encryption mode **Full (strict)**.
3. **SSL/TLS → Origin Server → Create Certificate**: let Cloudflare generate the key, hostnames
   `chess.example.com`, validity 15 years. Keep the page open; you paste both parts in step 5.
4. **SSL/TLS → Edge Certificates**: Always Use HTTPS **on**.
5. **Caching → Cache Rules → Create rule** "Rookery static":
   - When: Hostname equals `chess.example.com` **and** URI Path starts with `/maia/`
     (add OR conditions for `/ort/`, `/stockfish/`, `/assets/`)
   - Then: **Eligible for cache**; Edge TTL **Use cache-control header if present**.

   Without this rule Cloudflare doesn't cache `.onnx`, `.wasm` or `.mjs`, and every new visitor pulls ~58 MB
   from the droplet's port.

The Origin Certificate is only trusted by Cloudflare, so the record must stay proxied. If you ever turn the
orange cloud off, switch Caddy to Let's Encrypt first (delete the `tls` line in `deploy/Caddyfile`).

## 5. The droplet's `.env` and certificate

```bash
ssh deploy@203.0.113.10
cd /opt/rookery
nano certs/origin.pem        # paste "Origin Certificate"
nano certs/origin-key.pem    # paste "Private Key"
chmod 600 certs/origin-key.pem
openssl rand -hex 24         # copy: the database password
nano .env                    # contents below
chmod 600 .env
```

```dotenv
DOMAIN=chess.example.com
GHCR_OWNER=azhanhannan
POSTGRES_PASSWORD=<the hex from openssl>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
IMAGE_TAG=latest
```

Leave the Google keys empty for the first deploy (the button is hidden); step 8 turns it on.

**Keep a copy of `POSTGRES_PASSWORD` in your password manager.** Postgres sets it once, when the volume is
first created; changing it in `.env` later doesn't change the database's password.

## 6. GitHub: deploy key, secrets, environment

A dedicated key for CI, so you can revoke it without touching your own:

```bash
ssh-keygen -t ed25519 -f rookery-deploy -N "" -C "github-actions rookery"
ssh deploy@203.0.113.10 "cat >> ~/.ssh/authorized_keys" < rookery-deploy.pub
ssh-keyscan -t ed25519 203.0.113.10        # the known_hosts line
```

Repo → Settings → Environments → **New environment** `production`. Optionally tick "Required reviewers"
(you): then every deploy waits for a click, and tests/builds still run on their own.

In that environment, add **secrets**:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `203.0.113.10` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the whole contents of `rookery-deploy` (the private key) |
| `DEPLOY_KNOWN_HOSTS` | the `ssh-keyscan` output line |

Then delete the local `rookery-deploy` private key file. `GITHUB_TOKEN` is automatic: CI uses it to push
images to GHCR and passes it to the droplet for the pull, and it expires when the job ends.

`deploy` is in the `docker` group, which is root-equivalent: anyone with that key owns the droplet. Keep
it in the `production` environment only, and rotate it if the repo is ever shared.

## 7. First deploy

```powershell
cd C:\laragon\www\chess
git merge deploy/docker
git push
```

Actions → CI/CD shows four stages:

1. **test**: `npm ci`, engine/Maia files, `tsc -b`, lint, `npm test`, `npm run test:server` (~5 min).
2. **build**: `rookery-api` and `rookery-web` images to `ghcr.io/azhanhannan/`, tagged with the commit
   SHA and `latest` (first run ~6 min, cached after).
3. **deploy**: copies `compose.yaml`, `deploy.sh`, `backup.sh`; runs `deploy.sh <sha>`; `--wait` blocks
   until db and api are healthy (the first start runs every migration).
4. **smoke test**: `https://chess.example.com/api/health` and `/` through Cloudflare.

If **test** fails on something that passes on Windows (path case, timing in the real-Stockfish tests),
fix the test, don't drop the step.

## 8. Check it, then turn on Google sign-in

- Open `https://chess.example.com`: play a bot game, including a Maia bot (the model loads), sign up,
  finish a game, see it in History, sign out and back in.
- DevTools → Network: the second load of `/maia/maia3_simplified.onnx` shows `cf-cache-status: HIT`.

Google sign-in: Google Auth Platform → Clients → your web client → Authorized redirect URIs → add
`https://chess.example.com/api/auth/google/callback` (and the JavaScript origin `https://chess.example.com`).
Fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `/opt/rookery/.env`, then:

```bash
cd /opt/rookery && docker compose up -d api
docker compose logs api | grep -i google     # "Google sign-in is on"
```

## 9. Off-site backups (recommended)

`backup.sh` runs nightly and before every deploy, keeping 14 days in `/opt/rookery/backups`. Those die
with the droplet. To push them off-site with restic to Cloudflare R2 (personal account, not EDESS's):

1. R2 → Create bucket `rookery-backup`; Manage API tokens → Object Read & Write on that bucket only.
2. On the droplet, `/opt/rookery/restic.env` (chmod 600):

   ```dotenv
   RESTIC_REPOSITORY=s3:https://<account-id>.r2.cloudflarestorage.com/rookery-backup
   RESTIC_PASSWORD=<long random; store it in your password manager — without it the backups are unreadable>
   AWS_ACCESS_KEY_ID=<token access key>
   AWS_SECRET_ACCESS_KEY=<token secret>
   ```

3. `set -a; source restic.env; set +a; restic init`, then `./backup.sh manual`: it ends with
   "pushed off-site with restic".

**Test a restore once** (below) before trusting it.

## Day-to-day

Everything runs as `deploy` in `/opt/rookery`.

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f --tail 100 api` (or `web`, `db`) |
| Restart the API | `docker compose restart api` |
| What's deployed | `tail deploy-history.log`, or `grep IMAGE_TAG .env` |
| Redeploy current main | Actions → CI/CD → Run workflow |
| Database shell | `docker compose exec db psql -U rookery -d rookery` |
| Backup now | `./backup.sh manual` |
| Disk | `df -h /` and `docker system df` |

### Rollback

```bash
cd /opt/rookery && tail deploy-history.log     # pick the previous good SHA
./deploy.sh <sha>
```

Images older than a week are pruned. To roll back further, log in first:
`docker login ghcr.io -u azhanhannan` with a classic PAT that has only `read:packages`, then `docker logout ghcr.io`.

Migrations only go forward. Rolling back past a release that added a migration usually still works
(older code ignores new tables and columns). If it doesn't, restore that deploy's `*-pre-deploy.sql.gz`.

### Restore a backup

```bash
cd /opt/rookery
docker compose stop api web
gunzip -c backups/rookery-<stamp>-<label>.sql.gz | docker compose exec -T db psql -U rookery -d rookery -v ON_ERROR_STOP=1
docker compose up -d --wait
```

The dumps are made with `--clean --if-exists`, so they replace what's there. From restic:
`restic restore latest --target /tmp/r` and use the file under `/tmp/r/opt/rookery/backups/`.

### Upgrading

- **OS**: unattended-upgrades applies security updates. Reboot when `/var/run/reboot-required` exists:
  `sudo reboot` (all containers have `restart: unless-stopped`).
- **Node, Caddy**: bump `NODE_IMAGE` or the `caddy:` tag in the `Dockerfile` and push.
- **Postgres** minor (18.x): `docker compose pull db && docker compose up -d db`.
  A major version (18 → 19) can't reuse the volume: back up, start the new version on a new volume, restore.

### Monitoring

DigitalOcean Monitoring → create alerts for CPU > 80% for 5 min, memory > 90%, disk > 80%.
For uptime, a free external check (e.g. UptimeRobot) on `https://chess.example.com/api/health` every 5 minutes.

## Cost

| Item | Monthly |
|---|---|
| Droplet Basic 2 GB | $12.00 |
| Droplet weekly backups (optional) | $2.40 |
| GHCR + Actions (private repo, free plan: 2,000 min/mo, each run ~10–15 min) | $0 |
| Cloudflare free plan, R2 (first 10 GB free) | $0 |
| Domain | your registrar's price |

## Known limits

- **One app per droplet, for now.** Rookery's `web` (Caddy) container binds 80/443. A second
  `*.runcodecloud.com` app on the same droplet means moving Caddy out of this stack into a shared proxy
  (e.g. `/opt/proxy`) that routes by hostname. The Origin Certificate is already `*.runcodecloud.com`.

- **Client IPs**: Caddy sees Cloudflare's edge IPs, so the login throttle keys on `username|edge IP`.
  It still slows guessing on one account. For true client IPs, add Cloudflare's IP ranges as Caddy
  `trusted_proxies` and read `CF-Connecting-IP`.
- **Single server**: an outage of the droplet is an outage of accounts and sync. Play still works offline
  in the browser (localStorage is the source of truth), so this degrades gracefully.
- **Downtime per deploy**: a few seconds while the api container restarts and runs migrations.
- **The backup set is the database only.** `backup.sh` pushes `backups/` to restic and nothing else, so
  `/opt/rookery/.env` and `certs/` are not in it. Both are reproducible — the Origin Certificate from
  Cloudflare in a click, `GOOGLE_CLIENT_SECRET` from Google Auth Platform — but `POSTGRES_PASSWORD` is
  not, because Postgres set it once when the volume was created. That is why step 5 says to keep it in
  your password manager; losing it means restoring the dump into a fresh volume.
