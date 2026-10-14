import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export type EmbeddedDb = { url: string; stop: () => Promise<void> };

/**
 * A real PostgreSQL server run from node_modules (embedded-postgres), so the app needs no
 * Postgres install for development and tests. Production sets DATABASE_URL instead.
 * `persistent: false` deletes the data directory on stop (tests, e2e).
 */
export async function startEmbeddedDb(opts: { dir: string; port: number; persistent: boolean; database?: string }): Promise<EmbeddedDb> {
  const database = opts.database ?? 'rookery';
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    user: 'rookery',
    password: 'rookery',
    port: opts.port,
    persistent: opts.persistent,
    // Postgres 18's default io_method=worker starts I/O worker processes that outlive a killed
    // postmaster on Windows, holding the port and the data files. Synchronous I/O has none.
    postgresFlags: ['-c', 'io_method=sync'],
    onLog: () => {},
  });
  const fresh = !existsSync(join(opts.dir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(database);
  return {
    url: `postgresql://rookery:rookery@localhost:${opts.port}/${database}`,
    stop: () => pg.stop(),
  };
}

/**
 * Stops a Postgres still running on `dir` from a process that was killed without cleaning up
 * (Playwright can't send SIGTERM on Windows, so its e2e server never gets to stop its database).
 */
export async function stopStaleEmbeddedDb(dir: string): Promise<void> {
  if (!existsSync(join(dir, 'postmaster.pid'))) return;
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  const { pg_ctl } = (await import(`@embedded-postgres/${os}-${process.arch}`)) as { pg_ctl: string };
  try {
    execFileSync(pg_ctl, ['stop', '-D', dir, '-m', 'immediate', '-w'], { stdio: 'ignore' });
  } catch {
    // not running after all
  }
}

/** A TCP port nothing is listening on right now (throwaway databases use one, so a leftover can't block them). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

/** True when something already listens on `port` (embedded-postgres would otherwise wait forever). */
export function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(true));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(false)));
  });
}
