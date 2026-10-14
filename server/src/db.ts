import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '../generated/prisma/client';

export type Db = PrismaClient;

export function createDb(url: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** Applies prisma/migrations to the database at `url` (idempotent). */
export function migrate(url: string): void {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
