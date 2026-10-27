import type { FastifyInstance } from 'fastify';
import { RATINGS } from '../../../src/config/tunables';
import type { ProfileResponse, RatingCategory, RatingRow } from '../../../src/api/types';
import { isProvisional } from '../../../src/rating/glicko';
import { toPublicUser } from '../auth/session';
import type { Db } from '../db';
import { PUZZLE_CATEGORY, puzzleRatingRow } from './puzzles';

/** Categories in the order RATINGS lists them (fastest first). */
const CATEGORY_ORDER: readonly string[] = RATINGS.categories.map((c) => c.id);

// Public: anyone (signed in or not) can see a player's ratings and history, never their games.
export async function profileRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { username: string } }>('/profile/:username', async (request, reply) => {
    const { username } = request.params;
    const user = await db.user.findUnique({
      where: { usernameKey: username.trim().toLowerCase() },
      select: { id: true, username: true, createdAt: true },
    });
    if (!user) return reply.code(404).send({ error: `No player called "${username}".` });

    const [ratings, events, games, rated, puzzle] = await Promise.all([
      // The puzzle rating lives in Rating too, but it is not a game rating.
      db.rating.findMany({ where: { userId: user.id, category: { not: PUZZLE_CATEGORY } } }),
      db.ratingEvent.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { category: true, ratingAfter: true, rdAfter: true, createdAt: true, game: { select: { clientId: true } } },
      }),
      db.game.count({ where: { userId: user.id } }),
      db.game.count({ where: { userId: user.id, rated: true } }),
      puzzleRatingRow(db, user.id),
    ]);

    const rows: RatingRow[] = ratings
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
      .map((r) => ({
        category: r.category as RatingCategory,
        rating: Math.round(r.rating),
        rd: Math.round(r.rd),
        games: r.games,
        provisional: isProvisional(r.rd),
      }));
    return reply.send({
      user: toPublicUser(user),
      ratings: rows,
      history: events.map((e) => ({
        category: e.category as RatingCategory,
        rating: Math.round(e.ratingAfter),
        at: e.createdAt.toISOString(),
        gameClientId: e.game.clientId,
        provisional: isProvisional(e.rdAfter),
      })),
      counts: { games, rated },
      puzzle,
    } satisfies ProfileResponse);
  });
}
