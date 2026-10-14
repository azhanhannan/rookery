import { rmSync } from 'node:fs';
import { buildApp } from './app';
import { createDb, migrate } from './db';
import { freePort, portInUse, startEmbeddedDb, stopStaleEmbeddedDb, type EmbeddedDb } from './embeddedDb';

// Dev: `npm run server` (embedded Postgres in .data/pg, kept between runs).
// E2E: ROOKERY_EPHEMERAL_DB=1 starts a throwaway database.
// Production: set DATABASE_URL and no embedded server starts.
const port = Number(process.env.PORT ?? 5181);
let embedded: EmbeddedDb | null = null;
let url = process.env.DATABASE_URL;
if (!url) {
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
const app = await buildApp({ db, logger: true });

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

await app.listen({ port, host: '127.0.0.1' });
