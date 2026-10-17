import { rmSync } from 'node:fs';
import { buildApp } from './app';
import { googleFromEnv } from './auth/google';
import { createDb, migrate } from './db';
import { backfillInsights } from './insights/store';
import type { EmbeddedDb } from './embeddedDb';

// Dev: `npm run server` (embedded Postgres in .data/pg, kept between runs).
// E2E: ROOKERY_EPHEMERAL_DB=1 starts a throwaway database.
// Production: set DATABASE_URL and no embedded server starts. Docker (deploy/) also sets HOST=0.0.0.0 and
// TRUST_PROXY=1 (Caddy in front). See docs/DEPLOY.md.
// Settings (Google sign-in keys) come from .env when there is one; see .env.example.
try {
  process.loadEnvFile();
} catch {
  // no .env: fine
}
const port = Number(process.env.PORT ?? 5181);
let embedded: EmbeddedDb | null = null;
let url = process.env.DATABASE_URL;
if (!url) {
  // embedded-postgres is a dev dependency: loaded only here, so a production install can omit it.
  const { freePort, portInUse, startEmbeddedDb, stopStaleEmbeddedDb } = await import('./embeddedDb');
  const ephemeral = process.env.ROOKERY_EPHEMERAL_DB === '1';
  const dir = ephemeral ? `.data/pg-e2e-${port}` : '.data/pg';
  // A server killed hard leaves its Postgres running (Playwright can't send SIGTERM on Windows): stop it first.
  await stopStaleEmbeddedDb(dir);
  if (ephemeral) rmSync(dir, { recursive: true, force: true });
  // Throwaway databases take any free port: a killed run can leave Postgres workers holding the old one.
  const pgPort = ephemeral ? await freePort() : Number(process.env.PG_PORT ?? 54320);
  if (await portInUse(pgPort)) {
    throw new Error(`Port ${pgPort} is busy: is another Postgres (or a leftover postgres.exe) running? Stop it or set PG_PORT.`);
  }
  embedded = await startEmbeddedDb({ dir, port: pgPort, persistent: !ephemeral });
  url = embedded.url;
}
migrate(url);

const db = createDb(url);
const google = googleFromEnv();
const app = await buildApp({ db, logger: true, google, trustProxy: process.env.TRUST_PROXY === '1' });
app.log.info(google ? 'Google sign-in is on' : 'Google sign-in is off (no GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await db.$disconnect();
  await embedded?.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });

// Insights facts for games saved before GameInsight existed, or under an older factsVersion. In the
// background: cheap (no engine), and readers rebuild anything still stale on their own.
void backfillInsights(db, (err) => app.log.warn({ err }, 'insights facts failed')).then(
  (n) => n && app.log.info(`Insights: built facts for ${n} saved game${n === 1 ? '' : 's'}`),
  (err: unknown) => app.log.error({ err }, 'insights backfill failed'),
);
