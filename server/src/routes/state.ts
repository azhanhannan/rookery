import type { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/client';
import { SYNC } from '../../../src/config/tunables';
import type { StateItem, StatePutRequest, StateResponse } from '../../../src/api/types';
import { syncKind } from '../../../src/sync/keys';
import { mergeItem, normalizeValue, sameValue } from '../../../src/sync/merge';
import { requireUser } from '../auth/session';
import type { Db } from '../db';

type Row = { key: string; value: unknown; updatedAt: Date };

function toItems(rows: Row[]): Record<string, StateItem> {
  return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: r.updatedAt.getTime() }]));
}

async function readAll(db: Db, userId: string): Promise<Record<string, StateItem>> {
  return toItems(await db.userState.findMany({ where: { userId }, select: { key: true, value: true, updatedAt: true } }));
}

type Checked = { ok: true; items: { key: string; item: StateItem }[] } | { ok: false; status: number; error: string };

/** Validates a PUT body: allowlisted keys, well-formed values, each under SYNC.maxValueBytes. */
function check(body: unknown, now: number): Checked {
  const items = (body as Partial<StatePutRequest> | null)?.items;
  if (!items || typeof items !== 'object' || Array.isArray(items))
    return { ok: false, status: 400, error: '"items" must be an object of key -> { value, updatedAt }.' };
  const out: { key: string; item: StateItem }[] = [];
  for (const [key, raw] of Object.entries(items)) {
    const kind = syncKind(key);
    if (!kind) return { ok: false, status: 400, error: `"${key}" is not a setting that can be saved to the account.` };
    const it = raw as Partial<StateItem> | null;
    if (!it || typeof it !== 'object' || typeof it.updatedAt !== 'number' || !Number.isFinite(it.updatedAt) || it.updatedAt < 0)
      return { ok: false, status: 400, error: `"${key}" needs a value and a numeric updatedAt.` };
    if (JSON.stringify(it.value ?? null).length > SYNC.maxValueBytes)
      return { ok: false, status: 413, error: `"${key}" is too large to save to the account.` };
    const value = normalizeValue(kind, it.value ?? null);
    if (value === undefined) return { ok: false, status: 400, error: `"${key}" has a value of the wrong shape.` };
    // A device clock running ahead must not make its changes win forever.
    out.push({ key, item: { value, updatedAt: Math.min(Math.round(it.updatedAt), now) } });
  }
  return { ok: true, items: out };
}

// The signed-in player's synced preferences and training state (see src/sync).
export async function stateRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/state', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return reply.send({ items: await readAll(db, user.id) } satisfies StateResponse);
  });

  app.put('/state', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const checked = check(request.body, Date.now());
    if (!checked.ok) return reply.code(checked.status).send({ error: checked.error });

    await db.$transaction(async (tx) => {
      // One push per player at a time, so two devices pushing at once merge one after the other.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${user.id}))`;
      const stored = toItems(
        await tx.userState.findMany({
          where: { userId: user.id, key: { in: checked.items.map((i) => i.key) } },
          select: { key: true, value: true, updatedAt: true },
        }),
      );
      for (const { key, item } of checked.items) {
        const kind = syncKind(key)!;
        const old = stored[key];
        const oldValue = old ? normalizeValue(kind, old.value) : undefined;
        const merged = mergeItem(kind, item, oldValue === undefined ? undefined : { value: oldValue, updatedAt: old!.updatedAt })!;
        if (old && sameValue(merged.value, old.value) && merged.updatedAt === old.updatedAt) continue;
        const data = {
          value: merged.value === null ? Prisma.JsonNull : (merged.value as Prisma.InputJsonValue),
          updatedAt: new Date(merged.updatedAt),
        };
        await tx.userState.upsert({
          where: { userId_key: { userId: user.id, key } },
          create: { userId: user.id, key, ...data },
          update: data,
        });
      }
    });
    return reply.send({ items: await readAll(db, user.id) } satisfies StateResponse);
  });
}
