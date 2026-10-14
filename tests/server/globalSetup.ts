import { rmSync } from 'node:fs';
import type { TestProject } from 'vitest/node';
import { migrate } from '../../server/src/db';
import { freePort, startEmbeddedDb, type EmbeddedDb } from '../../server/src/embeddedDb';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let db: EmbeddedDb | null = null;

export async function setup(project: TestProject) {
  const dir = '.data/pg-test';
  rmSync(dir, { recursive: true, force: true });
  db = await startEmbeddedDb({ dir, port: await freePort(), persistent: false });
  migrate(db.url);
  project.provide('databaseUrl', db.url);
}

export async function teardown() {
  await db?.stop();
}
