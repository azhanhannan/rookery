import { useState } from 'react';
import { pickAccountRating, useAccountRatings, useSessionCategoryRating } from '../account/accountRating';
import { useAuthStore } from '../account/authStore';
import { QUICK } from '../config/tunables';
import { useGameStore } from '../game/gameStore';
import { sparringOpponent, timeControlLabel } from '../game/sparring';
import { getMaia } from '../maia/MaiaService';
import { categoryFor } from '../rating/glicko';

/**
 * Play's one-click "Spar": a rated 10+5 game (rated when signed in) against the bot one level above the
 * player's rating for that time control, on a random side. Unknown rating: QUICK.sparDefaultRating.
 */
export function SparButton({ className }: { className?: string }) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const category = categoryFor(QUICK.sparTimeControl);
  const sessionRating = useSessionCategoryRating(category);
  const accountRating = pickAccountRating(useAccountRatings(), category);
  const rating = signedIn ? (sessionRating ?? accountRating) : null;
  const opponent = sparringOpponent(rating);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function spar() {
    const { record } = useGameStore.getState();
    if (record.result === '*' && record.moves.length > 0 && !window.confirm('Leave the game in progress?')) return;
    let pick = opponent;
    setNote(null);
    if (pick.engine === 'maia' && !getMaia().isLoaded()) {
      setLoading(true);
      try {
        await getMaia().load();
      } catch {
        // The human-like bot can't load: spar the engine bot one level up instead.
        pick = sparringOpponent(rating, false);
        setNote(`The human-like bot couldn't load, so this is ${pick.name}.`);
      } finally {
        setLoading(false);
      }
    }
    useGameStore.getState().newGame({
      side: 'random',
      timeControlId: QUICK.sparTimeControl,
      opponent: 'bot',
      botElo: pick.elo,
      ...(pick.engine === 'maia' ? { botEngine: 'maia' as const } : {}),
      rated: signedIn,
    });
  }

  return (
    <>
      <button
        className={className}
        onClick={() => void spar()}
        disabled={loading}
        data-testid="spar-button"
        title={`A ${signedIn ? 'rated' : 'timed'} game on a random side against the bot one level above ${rating === null ? 'a new player' : 'your rating'}`}
      >
        {loading ? 'Loading Maia…' : `Spar vs ${opponent.name} · ${timeControlLabel(QUICK.sparTimeControl)}`}
      </button>
      {note && (
        <p role="status" className="col-span-2 text-xs text-muted">
          {note}
        </p>
      )}
    </>
  );
}
