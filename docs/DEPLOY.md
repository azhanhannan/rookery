# Deploying Rookery to a DigitalOcean droplet

Runbook for putting Rookery on a single small droplet. Written 2026-10-23 against the
tree at `main` (waves 1-7, `docs/ROADMAP.md`).

## Why a small droplet is enough

Both engines run in the **player's** browser, not on the server:

- Stockfish is a WASM worker from `public/stockfish/` (`stockfish-19-lite-single`,
  single-threaded on purpose — see the note in `src/config/tunables.ts`).
- Maia is ONNX inference via `onnxruntime-web`, also single-threaded
  (`src/maia/maia.worker.ts` sets `ort.env.wasm.numThreads = 1`).
- Insights are engine-free. `server/src/insights/store.ts` says so in its own comment:
  the server runs the same pure code from `src/insights/` that the browser runs.

So the droplet does two things: nginx serving `dist/`, and a Fastify process doing
database reads. The `/api` server (`server/src/app.ts`) is CRUD — auth, games,
puzzles, state, coach, insights.

```
browser  ──  Stockfish WASM + Maia ONNX  (the player's CPU)
   │
   │  https://rookery.example
   ▼
nginx  ──  static dist/  (65 MB, of which 58 MB is maia + ort)
   │
   └── /api  ──►  127.0.0.1:5181  Fastify (tsx)  ──►  Postgres 18 (localhost)
```

**The binding constraint is bandwidth, not CPU.** A cold visitor who plays a Maia bot
pulls ~58 MB (44 MB model + 14 MB ORT runtime). Cache headers in §7 make that
once-per-browser rather than once-per-visit.

### Size

| Plan | Verdict |
|---|---|
| $4 — 512 MB / 1 vCPU / 10 GB | No. Node + Postgres will thrash. |
| $6 — 1 GB / 1 vCPU / 25 GB | Works, with swap (§1) and builds done off-box (§4). |
| **$12 — 2 GB / 1 vCPU / 50 GB** | **Use this.** Headroom; stop thinking about it. |

Confirm current prices on digitalocean.com — Basic Droplets were cut ~20% in Jan 2026.

When server-side Stockfish review lands (`docs/ROADMAP.md`, "Later"), this analysis
inverts: that is CPU-bound and wants 2 vCPU minimum.

---

## 0. Before you start

**This repo has no git remote.** `git remote -v` is empty. So:

- There is no `git pull` deploy path; §3 and §9 use `rsync`.
- The source code has **no off-machine copy at all**. The laptop is the only one.
  Fix that before going live — it is a bigger risk than anything else in this
  document. A private GitHub or GitLab repo, then `git push`.

Have ready: the droplet, a domain pointed at it (A record), and the Google OAuth
client if you want "Continue with Google" (it hides itself without keys).

---

## 1. Provision

Ubuntu 24.04 LTS. Then, as root:

```bash
adduser --disabled-password --gecos "" rookery
apt update && apt upgrade -y
apt install -y nginx postgresql-common curl rsync ufw
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

Swap — mandatory on 1 GB, cheap insurance on 2 GB:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
```

Node 24 (matches `@types/node ^24`; Vite 8 needs ≥20.19):

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

## 2. Postgres 18

Local dev runs Postgres 18 (`.data/pg/PG_VERSION`), so match it. Ubuntu 24.04 ships
16, so use PGDG:

```bash
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt install -y postgresql-18
```

Create the role and database — `psql` as the `postgres` user, then:

```sql
CREATE ROLE rookery LOGIN PASSWORD 'PUT-A-LONG-RANDOM-PASSWORD-HERE';
CREATE DATABASE rookery OWNER rookery;
```

Postgres listens on localhost only by default — leave it that way. Nothing but the
Fastify process needs it.

## 3. Code onto the box

From the laptop (Git Bash), source only — no `node_modules`, no `dist`, no `.data`:

```bash
cd /c/laragon/www/chess
rsync -az --delete --exclude node_modules --exclude dist --exclude .data --exclude test-results --exclude playwright-report --exclude server/generated --exclude .env --exclude .git ./ rookery@YOUR_DROPLET:/home/rookery/app/
```

Then on the droplet, as `rookery`:

```bash
cd ~/app && npm install
```

**Install the full dependency tree — `npm ci --omit=dev` will break the server.**
Two devDependencies are needed at runtime:

- `tsx`, because `server:start` runs the TypeScript directly;
- `prisma`, because `migrate()` in `server/src/db.ts` shells out to
  `node_modules/prisma/build/index.js migrate deploy`.

`postinstall` runs `prisma generate` into `server/generated/` — that is why the
rsync excludes it. Expect ~1.1 GB of `node_modules`; `@embedded-postgres` (108 MB)
is dead weight here but harmless, since §5 sets `DATABASE_URL` and the embedded
server never starts.

## 4. Build off the box

`tsc -b && vite build` over a 1.1 GB dependency tree will OOM or crawl on 1 vCPU.
Build on the laptop and ship the output.

```bash
cd /c/laragon/www/chess
npm run build
rsync -az --delete dist/ rookery@YOUR_DROPLET:/home/rookery/app/dist/
```

`prebuild` runs `copy-stockfish.mjs` and `fetch-maia.mjs` for you, so `dist/` comes
out self-contained — including `dist/maia/maia3_simplified.onnx` and `dist/ort/`.
Both are gitignored in the repo, so shipping `dist` is what gets them onto the
server at all.

`public/puzzles/puzzles.json` (569 KB) is committed and travels with the rsync in
§3. The server reads it from **`process.cwd()`**
(`server/src/puzzles/catalog.ts`), which is why the systemd unit sets
`WorkingDirectory` to the repo root. Without it every puzzle attempt is scored as an
unknown puzzle, silently.

The 307 MB `lichess_db_puzzle.csv.zst` in `.data/` is a build-time input for
`scripts/build-puzzles.mjs`. It never goes to the droplet.

## 5. Environment

`/home/rookery/app/.env`, owned by `rookery`, `chmod 600`:

```ini
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://rookery.example/api/auth/google/callback
```

Add that exact redirect URI to the Google client (Google Auth Platform → Clients →
Web application) or the callback fails. Leave the keys empty and the Google button
simply does not render.

`main.ts` calls `process.loadEnvFile()`, so `.env` is read from the working
directory. `DATABASE_URL`, `PORT` and `NODE_ENV` go in the unit file instead, so
systemd owns them.

## 6. systemd unit

`/etc/systemd/system/rookery-api.service`:

```ini
[Unit]
Description=Rookery API (Fastify)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=rookery
WorkingDirectory=/home/rookery/app
Environment=NODE_ENV=production
Environment=PORT=5181
Environment=DATABASE_URL=postgresql://rookery:PUT-A-LONG-RANDOM-PASSWORD-HERE@127.0.0.1:5432/rookery
ExecStart=/usr/bin/node --import tsx/esm server/src/main.ts
Restart=always
RestartSec=3
KillMode=mixed
TimeoutStopSec=20
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Three things in there are load-bearing:

- **`NODE_ENV=production`.** `server/src/auth/session.ts` sets the session cookie's
  `secure` flag from `process.env.NODE_ENV === 'production'`. Miss it and session
  cookies go out without `Secure` over HTTPS.
- **`DATABASE_URL` set.** `main.ts` only starts embedded Postgres when it is absent.
- **`--import tsx/esm` rather than `npm run server:start`.** It keeps everything in
  one process, so systemd's SIGTERM reaches the `shutdown()` handler in `main.ts`
  instead of dying at an `npm` or `tsx` CLI wrapper.

```bash
systemctl daemon-reload && systemctl enable --now rookery-api
journalctl -u rookery-api -f
```

Migrations need no separate step: `migrate(url)` runs `prisma migrate deploy` on
every start, before the app listens.

## 7. nginx

`/etc/nginx/sites-available/rookery`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name rookery.example;

    root /home/rookery/app/dist;
    index index.html;

    # A GameRecord with a full review is well over 1 MB; Fastify's bodyLimit is 8 MB
    # (server/src/app.ts). nginx defaults to 1 MB and would reject the save first.
    client_max_body_size 8m;

    gzip on;
    gzip_vary on;
    gzip_types text/css application/javascript application/json image/svg+xml application/wasm;
    gzip_min_length 1024;
    # Not .onnx: 44 MB of float data barely compresses and costs CPU on every miss.
    # No `types` block here: .wasm is already application/wasm in nginx's own
    # mime.types (since 1.21.5), and a server-level `types` block REPLACES the
    # inherited map rather than adding to it -- CSS and JS would go out as
    # application/octet-stream and the app would not boot.

    location /api/ {
        proxy_pass http://127.0.0.1:5181;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Content-addressed or version-named: cache hard.
    location ~* ^/(assets|maia|ort|stockfish|boards|pieces)/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Rebuilt by scripts/build-puzzles.mjs: revalidate.
    location /puzzles/ {
        expires 1h;
        add_header Cache-Control "public";
    }

    # Never cache the shell, or a deploy's new asset hashes stay invisible.
    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`maia3_simplified.onnx` has a fixed name, not a content hash, so `immutable` is what
turns 58 MB per visitor into 58 MB per browser. If the model is ever replaced, bump
its path in `src/config/tunables.ts` (`MAIA.modelUrl`) rather than relying on cache
eviction.

**Do not add `Cross-Origin-Embedder-Policy: require-corp`.** Both engines are
deliberately single-threaded so the app needs no cross-origin isolation — the
comments in `tunables.ts` and `maia.worker.ts` say so. Adding COEP buys nothing and
breaks the Google sign-in redirect.

```bash
ln -s /etc/nginx/sites-available/rookery /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
chmod o+x /home/rookery
apt install -y certbot python3-certbot-nginx
certbot --nginx -d rookery.example
```

`chmod o+x /home/rookery` is there because nginx has to traverse the home directory
to reach `dist/`.

## 8. Smoke test

```bash
curl -s https://rookery.example/api/health
curl -sI https://rookery.example/maia/maia3_simplified.onnx | grep -i -E 'length|cache'
```

`/api/health` returns `{"ok":true}`. Then in a browser: sign up, play a Maia bot
(watch the model download once, then not again on reload), finish and save the game,
open `#/insights`, solve a puzzle and confirm the rating moves. Sign in with Google
if configured.

## 9. Deploying again

```bash
cd /c/laragon/www/chess
npx tsc -b && npm test && npm run build
rsync -az --delete --exclude node_modules --exclude dist --exclude .data --exclude test-results --exclude server/generated --exclude .env --exclude .git ./ rookery@YOUR_DROPLET:/home/rookery/app/
rsync -az --delete dist/ rookery@YOUR_DROPLET:/home/rookery/app/dist/
```

Then on the droplet:

```bash
cd ~/app && npm install && sudo systemctl restart rookery-api
```

`npm install` only matters when `package.json` changed. New migration in
`prisma/migrations/`? Nothing extra — the restart applies it. Take a backup first
(§10) if the migration is destructive.

## 10. Backups: pg_dump → restic → R2

Same shape as the Albayen JPID job (`plan/docs/it-ops/albayen-mysql-backup.sh`),
with `pg_dump` in place of `mysqldump`. Its own repository, its own bucket key, its
own healthchecks.io check — a shared check cannot say *which* host went quiet.

`/usr/local/bin/rookery-backup.sh`, `chmod 700`, run as root:

```bash
#!/usr/bin/env bash
#
# rookery-backup.sh -- Rookery droplet backup: Postgres dump -> restic -> R2.
#
# The DATABASE is the only irreplaceable thing on this box. dist/ is rebuilt from
# source, node_modules from package-lock.json, the Maia model re-downloaded by
# scripts/fetch-maia.mjs. Accounts, saved games, ratings and insights are not.
#
# .env IS in the set: the Google client secret exists nowhere else on the droplet.
#
# Retention is 7 daily / 4 weekly / 6 monthly -- enforced below, not an intention.
set -euo pipefail

STAGING="/var/backups/rookery"
DATE="$(date +%F_%H%M)"
APP="/home/rookery/app"
HC_URL="https://hc-ping.com/REPLACE-WITH-ROOKERY-UUID"

export RESTIC_PASSWORD_FILE="/root/.restic-rookery-pass"   # chmod 600; copy OFF the droplet
# shellcheck source=/dev/null
source /root/.restic-rookery-env                           # chmod 600; RESTIC_REPOSITORY + AWS_*
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is not set in /root/.restic-rookery-env}"

mkdir -p "$STAGING"

# --format=custom so a single table can be restored without replaying the whole dump.
sudo -u postgres pg_dump --format=custom --no-owner --no-acl rookery \
  > "$STAGING/rookery_${DATE}.dump"

restic backup --tag rookery "$STAGING" "$APP/.env"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
find "$STAGING" -type f -mtime +2 -delete

# Only reached if everything above succeeded.
curl -fsS --retry 3 "$HC_URL" > /dev/null
```

Setup, as root:

```bash
apt install -y restic
printf '%s' 'A-LONG-RANDOM-PASSPHRASE' > /root/.restic-rookery-pass
chmod 600 /root/.restic-rookery-pass
```

Put the destination in `/root/.restic-rookery-env` (`chmod 600`) so moving it later
is a config change rather than an edit to the script:

```ini
export RESTIC_REPOSITORY="s3:https://ACCOUNT_ID.r2.cloudflarestorage.com/rookery-backup"
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
```

Then initialise the repository once:

```bash
set -a && . /root/.restic-rookery-env && set +a
RESTIC_PASSWORD_FILE=/root/.restic-rookery-pass restic init
```

Then a systemd timer or root crontab entry calling the script. **Keep the passphrase
off the droplet** — a backup you cannot decrypt is not a backup.

Restore:

```bash
restic snapshots --tag rookery
restic restore <SNAPSHOT_ID> --target /tmp/restore
sudo -u postgres pg_restore --clean --if-exists -d rookery /tmp/restore/var/backups/rookery/rookery_<DATE>.dump
```

Do that once, for real, before you trust it. The EDESS register ids (W1 confirm, M1
restore test, Q1 drill) govern the company estate, not a personal box — so pick your
own rhythm here, but write down what you picked. An untested restore is the thing
that goes wrong.

## 11. Things not to do

| Don't | Because |
|---|---|
| Build on the droplet | `tsc -b && vite build` over 1.1 GB of deps OOMs on 1 vCPU / 1 GB |
| `npm ci --omit=dev` | `tsx` and `prisma` are devDependencies the server needs at runtime |
| Leave `DATABASE_URL` unset | `main.ts` starts embedded Postgres into `.data/pg` instead |
| Run without `NODE_ENV=production` | session cookies lose their `Secure` flag |
| Add `COEP: require-corp` | not needed (both engines single-threaded); breaks Google sign-in |
| gzip the `.onnx` | ~44 MB of float data, negligible saving, CPU on every cache miss |
| Start the service outside the repo root | `puzzles.json` is read from `process.cwd()`; attempts score as unknown |
| Leave nginx at the default 1 MB body limit | a reviewed game exceeds it; saves fail |
