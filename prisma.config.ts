import { defineConfig } from 'prisma/config';

// DATABASE_URL is set by server/src/main.ts (embedded Postgres) or by the environment.
// Unset, it points at the dev database `npm run server` starts, so `npm run db:studio` just works.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://rookery:rookery@localhost:54320/rookery' },
});
