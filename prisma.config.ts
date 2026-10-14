import { defineConfig } from 'prisma/config';

// DATABASE_URL is set by server/src/main.ts (embedded Postgres) or by the environment.
// `prisma generate` needs no database, so a placeholder is fine there.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://unset/unset' },
});
