// Player profile, "Your recent games" (pure): a re-reading of the Insights model as dated, counted habit lines.
// Spec: docs/player-profile-2026-10/decision.md (Slices 1-3). No engine: InsightsModel -> PlayerProfile.
// Slice 2 adds rushed critical moves (a clock line); Slice 3 cost by type (forcing vs quiet moves), the first
// style-gated line: 40 games at one speed against people and Maia bots, the flip test, never on Learner.
//
// Rules the wording keeps (decision §2):
// - Verbs, not nouns: what the player did in these games, never what they are. PROFILE_BANNED is tested.
// - Every line names its count, its games and its opponent group, with a 90% interval and a state:
//   clear (the interval of the comparison excludes the reference), leaning (gate passed, interval doesn't),
//   or not-enough (below the line's own card gate: hidden, kept in `waiting` with "n of X").
// - Strengths pass the same gate as habits. Comparison words appear only on clear lines.
// - Opponent-dependent lines (converting, saving) use people and Maia bots only, never Stockfish levels.
// - The Focus stays the only action: no line carries a training link; the line matching the Focus says so.
import { INSIGHTS } from '../config/tunables';
import type { Estimate } from './stats';
import type { BucketId, CostByType, EpisodeStat, EvidenceRef, InsightsModel, ModelWindow, Phase, PhaseRate, Speed } from './types';

export type ProfileState = 'clear' | 'leaning' | 'not-enough';
/** strength / habit: a clear comparison either way; reassurance: "not where you lose points"; neutral: leaning. */
export type ProfileTone = 'strength' | 'habit' | 'reassurance' | 'neutral';
export type ProfileTrait = 'phase' | 'threats' | 'conversion' | 'saves' | 'clock' | 'openings' | 'cost-by-type';
/** Style-gated traits (decision §5): Learner never sees them. */
export const STYLE_TRAITS: readonly ProfileTrait[] = ['cost-by-type'];
/** 'all': every opponent the filters keep (own errors); 'human-like': people and Maia bots only. */
export type ProfileGroup = 'all' | 'human-like';
/** How `estimate` reads: per 100 moves, a share (0-1), or a ratio. */
export type ProfileFormat = 'per100' | 'share' | 'ratio';

export type ProfileLine = {
  /** 'phase', 'phase-strength', 'threats', 'conversion', 'saves', 'clock', 'rushed-critical', 'openings', 'cost-by-type'. */
  id: string;
  trait: ProfileTrait;
  /** Phase lines: which phase. */
  phase?: Phase;
  title: string;
  tone: ProfileTone;
  state: ProfileState;
  /** Verb sentence with its count (Club and Analyst). */
  text: string;
  /** The same without numbers, for Learner: clear strengths and the reassurance only. */
  plain?: string;
  /** Analyst extra detail, if any. */
  detail?: string;
  /** How many of what the line counts ("82 moves after a threat"). */
  n: number;
  unit: string;
  /** Games the line is read from. */
  games: number;
  group: ProfileGroup;
  estimate: Estimate;
  format: ProfileFormat;
  /** What the estimate is compared with (same format). */
  reference?: number;
  /** Below its gate: what it has and needs. */
  need?: { have: number; of: number; what: string };
  /** This line describes the Focus. */
  isFocus: boolean;
  /** Positions behind the line (Analyst links). */
  evidence: { gameId: string; ply?: number }[];
  /** Left out of the line (Stockfish-level games, for converting and saving). */
  note?: string;
};

export type PlayerProfile = {
  /** locked: fewer than minSample.profileGames games; only "n of 20" is shown. */
  status: 'locked' | 'open';
  games: number;
  needGames: number;
  window: ModelWindow;
  filters: InsightsModel['filters'];
  /** "Mostly from games against bots (24 of 30)." when bots are more than half. */
  groupNote: string | null;
  /** Lines past their gate (clear or leaning), in trait order. */
  lines: ProfileLine[];
  /** Lines still below their gate, with "n of X". */
  waiting: ProfileLine[];
  /** Style lines: games at the speed they are read at (the filter's, or the most played) vs people and Maia bots. */
  style: { have: number; of: number; speed: Speed | null };
  focus: { id: BucketId | null; lineId: string | null };
  closing: string;
};

export type ProfileOptions = {
  /** The Focus in force (pinned, coach's, or the ledger's pick); default the model's pick. */
  focusId?: BucketId | null;
};

export const SECTION_TITLE = 'Your recent games';
export const CLOSING_LINE = 'This describes your recent games, not you. It updates as you play.';

/**
 * Words and phrases no profile text may contain (decision §2 and AC4): labels, causes, peer comparisons.
 * Matched case-insensitively on word boundaries.
 */
export const PROFILE_BANNED: readonly RegExp[] = [
  /\byou are an? \b/i,
  /\byou're an? \b/i,
  /\battack(er|ing player)\b/i,
  /\bpositional\b/i,
  /\btilt/i,
  /\bbecause\b/i,
  /\btypical/i,
  /\btactician\b/i,
  /\bdefender\b/i,
  /\bconverter\b/i,
  /\bfighter\b/i,
  /\bcoffeehouse\b/i,
  /\baggressive\b/i,
  /\bsolid player\b/i,
  /\buniversal player\b/i,
  /\bplays? like\b/i,
  /\bTal\b/,
  /\bthan (most|other) players\b/i,
];

const PHASE_WORD: Record<Phase, string> = { O: 'opening', M: 'middlegame', E: 'endgame' };
const SPEED_WORD: Record<Speed, string> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', classical: 'classical', untimed: 'untimed' };
const rate1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (n: number) => `${n} time${n === 1 ? '' : 's'}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Errors per 100 qualifying moves over every phase (the reference for phase lines). */
function pooledRate(rates: PhaseRate[]): number {
  const moves = rates.reduce((s, r) => s + r.moves, 0);
  return moves ? (100 * rates.reduce((s, r) => s + r.errors, 0)) / moves : 0;
}

type Base = Pick<ProfileLine, 'id' | 'trait' | 'title' | 'group'>;

function waitingLine(base: Base, need: { have: number; of: number; what: string }, games: number): ProfileLine {
  return {
    ...base,
    tone: 'neutral',
    state: 'not-enough',
    text: `Not enough yet: ${need.have} of ${need.of} ${need.what}.`,
    n: need.have,
    unit: need.what,
    games,
    estimate: { value: 0, lo: 0, hi: 0 },
    format: 'per100',
    need,
    isFocus: false,
    evidence: [],
  };
}

const evidenceOf = (refs: EvidenceRef[]) => refs.map((e) => ({ gameId: e.gameId, ply: e.ply }));

// ---- the five Slice 1 traits ----------------------------------------------------------------------

/** Where your games are decided: the phase with the most errors, and a phase that clearly holds up. */
function phaseLines(model: InsightsModel): ProfileLine[] {
  const base: Base = { id: 'phase', trait: 'phase', title: 'Where your games are decided', group: 'all' };
  const shown = model.phaseRates.filter((r) => r.shown);
  const games = model.ledger.games;
  if (shown.length < 2) {
    const g = INSIGHTS.minSample;
    return [waitingLine(base, { have: shown.length, of: 2, what: `phases with ${g.cardMoves} moves and ${g.cardEvents} errors each` }, games)];
  }
  const pooled = pooledRate(model.phaseRates);
  const out: ProfileLine[] = [];
  const weak = [...shown].sort((a, b) => b.rate.value - a.rate.value)[0];
  const word = PHASE_WORD[weak.phase];
  const evidence = model.ledger.cells
    .filter((c) => c.phase === weak.phase)
    .flatMap((c) => c.evidence)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, INSIGHTS.notableMoves);
  const common = {
    phase: weak.phase,
    n: weak.moves,
    unit: `${word} moves`,
    games,
    estimate: weak.rate,
    format: 'per100' as const,
    reference: pooled,
    isFocus: false,
    evidence: evidenceOf(evidence),
  };
  if (weak.weakest) {
    out.push({
      ...base,
      ...common,
      tone: 'habit',
      state: 'clear',
      text:
        `Most of your errors come in the ${word}: ${rate1(weak.rate.value)} mistakes or worse per 100 moves there ` +
        `(${weak.errors} in ${weak.moves} moves), against ${rate1(pooled)} across the whole game.`,
    });
  } else {
    out.push({
      ...base,
      ...common,
      tone: 'neutral',
      state: 'leaning',
      text:
        `The ${word} has the most errors so far: ${rate1(weak.rate.value)} mistakes or worse per 100 moves ` +
        `(${weak.errors} in ${weak.moves} moves); not clearly more than the rest of the game yet.`,
    });
  }
  const strong = shown.filter((r) => r.phase !== weak.phase && r.rate.hi < pooled).sort((a, b) => a.rate.value - b.rate.value)[0];
  if (strong) {
    const w = PHASE_WORD[strong.phase];
    out.push({
      ...base,
      id: 'phase-strength',
      title: 'Where your moves hold up',
      tone: 'strength',
      state: 'clear',
      text:
        `Your ${w} moves hold up well: ${rate1(strong.rate.value)} mistakes or worse per 100 moves ` +
        `(${strong.errors} in ${strong.moves} moves), against ${rate1(pooled)} across the whole game.`,
      plain: `Your ${w} moves hold up well.`,
      phase: strong.phase,
      n: strong.moves,
      unit: `${w} moves`,
      games,
      estimate: strong.rate,
      format: 'per100',
      reference: pooled,
      isFocus: false,
      evidence: [],
    });
  }
  return out;
}

/** Checking their threats: how often a threat went through, against the same event on other moves. */
function threatLine(model: InsightsModel): ProfileLine {
  const base: Base = { id: 'threats', trait: 'threats', title: 'Checking their threats', group: 'all' };
  const t = model.threats;
  const g = INSIGHTS.minSample;
  const games = model.ledger.games;
  if (!t.shown) {
    const need =
      t.moves < g.cardMoves
        ? { have: t.moves, of: g.cardMoves, what: 'moves right after a threat' }
        : { have: t.missed, of: g.cardEvents, what: 'threats that went through' };
    return waitingLine(base, need, games);
  }
  const otherShare = t.otherMoves ? t.otherMissed / t.otherMoves : 0;
  const head =
    `After a move of theirs that made a threat, the threat went through ${times(t.missed)} in ${t.moves} moves ` +
    `(${pct(t.share.value)}): material or mate given away.`;
  const common = {
    n: t.moves,
    unit: 'moves right after a threat',
    games,
    estimate: t.share,
    format: 'share' as const,
    reference: otherShare,
    isFocus: false,
    evidence: evidenceOf(t.evidence),
  };
  if (t.ratio.lo > 1) {
    return { ...base, ...common, tone: 'habit', state: 'clear', text: `${head} That is more often than on your other moves (${pct(otherShare)}).` };
  }
  if (t.ratio.hi < 1) {
    return {
      ...base,
      ...common,
      tone: 'strength',
      state: 'clear',
      text: `${head} That is less often than on your other moves (${pct(otherShare)}).`,
      plain: 'You usually answer your opponent’s threats.',
    };
  }
  return { ...base, ...common, tone: 'neutral', state: 'leaning', text: `${head} No clear difference from your other moves yet.` };
}

/** Finishing won games or saving worse ones: people and Maia bots only, against what the positions were worth. */
function episodeLine(model: InsightsModel, kind: 'conversion' | 'saves'): ProfileLine {
  const card = kind === 'conversion' ? model.conversion : model.saves;
  const s: EpisodeStat = card.humanLike;
  const base: Base =
    kind === 'conversion'
      ? { id: 'conversion', trait: 'conversion', title: 'Finishing won games', group: 'human-like' }
      : { id: 'saves', trait: 'saves', title: 'Saving worse games', group: 'human-like' };
  const what = kind === 'conversion' ? 'clearly winning positions' : 'clearly losing positions';
  const left = card.stockfish.episodes;
  const note =
    left > 0
      ? `${plural(left, what.replace('positions', 'position'), what)} against Stockfish levels left out: their weaker levels give pieces away at random.`
      : undefined;
  if (!s.shown) {
    const line = waitingLine(base, { have: s.episodes, of: INSIGHTS.minSample.episodes, what: `${what} vs people and Maia bots` }, s.episodes);
    return note ? { ...line, note } : line;
  }
  const head =
    kind === 'conversion'
      ? `Against people and Maia bots you converted ${s.won} of ${s.episodes} ${what}` + (s.drawn ? ` and drew ${s.drawn}` : '') + ` (score ${pct(s.score.value)}).`
      : `Against people and Maia bots you saved ${s.won + s.drawn} of ${s.episodes} ${what}` + ` (${s.won} won, ${s.drawn} drawn; score ${pct(s.score.value)}).`;
  const common = {
    n: s.episodes,
    unit: `${what} vs people and Maia bots`,
    games: s.episodes,
    estimate: s.score,
    format: 'share' as const,
    reference: s.expected,
    isFocus: false,
    evidence: s.starts,
    ...(note ? { note } : {}),
  };
  const worth = `what those positions were worth on average (${pct(s.expected)})`;
  if (s.score.lo > s.expected) {
    return {
      ...base,
      ...common,
      tone: 'strength',
      state: 'clear',
      text: `${head} More than ${worth}.`,
      plain: kind === 'conversion' ? 'You finish the games you get winning.' : 'You save games from worse positions.',
    };
  }
  if (s.score.hi < s.expected) {
    return { ...base, ...common, tone: 'habit', state: 'clear', text: `${head} Less than ${worth}.` };
  }
  return { ...base, ...common, tone: 'neutral', state: 'leaning', text: `${head} No clear difference from ${worth} yet.` };
}

/** Clock use: errors in time trouble against the rest, where clocks were recorded. */
function clockLine(model: InsightsModel): ProfileLine {
  const base: Base = { id: 'clock', trait: 'clock', title: 'Using the clock', group: 'all' };
  const c = model.clock;
  const g = INSIGHTS.minSample;
  if (!c || c.games < g.clockGames) return waitingLine(base, { have: c?.games ?? 0, of: g.clockGames, what: 'games with a clock' }, c?.games ?? 0);
  if (c.troubleMoves < g.troubleMoves) return waitingLine(base, { have: c.troubleMoves, of: g.troubleMoves, what: 'moves in time trouble' }, c.games);
  const flag = c.lostOnTimeWhileBetter.length ? ` You lost on time while better in ${plural(c.lostOnTimeWhileBetter.length, 'game')}.` : '';
  const counts = `${plural(c.troubleErrors, 'error')} in ${c.troubleMoves} moves in time trouble, ${c.normalErrors} in ${c.normalMoves} other moves`;
  const common = {
    n: c.troubleMoves,
    unit: 'moves in time trouble',
    games: c.games,
    estimate: c.ratio,
    format: 'ratio' as const,
    reference: 1,
    isFocus: false,
    evidence: c.lostOnTimeWhileBetter.map((gameId) => ({ gameId })),
  };
  if (c.ratio.lo > 1) {
    return {
      ...base,
      ...common,
      tone: 'habit',
      state: 'clear',
      text: `Your moves get worse when the clock runs low: ${counts}, about ${c.ratio.value.toFixed(1)}× as often.${flag}`,
    };
  }
  if (c.ratio.hi < 1) {
    return {
      ...base,
      ...common,
      tone: 'strength',
      state: 'clear',
      text: `Your moves hold up when the clock runs low: ${counts}.${flag}`,
      plain: 'Your moves hold up when the clock runs low.',
    };
  }
  return { ...base, ...common, tone: 'neutral', state: 'leaning', text: `With the clock low: ${counts}; no clear difference yet.${flag}` };
}

/**
 * Rushed critical moves (Slice 2): positions where only one move held, played in under half the usual time per
 * move, against those played slowly. Needs clocks and reviews that kept the second engine line (version 2).
 */
function rushedLine(model: InsightsModel): ProfileLine {
  const base: Base = { id: 'rushed-critical', trait: 'clock', title: 'Taking time when one move holds', group: 'all' };
  const g = INSIGHTS.minSample;
  const what = 'clocked games reviewed with two engine lines';
  const r = model.clock?.rushedCritical ?? null;
  if (!r) {
    const line = waitingLine(base, { have: 0, of: g.clockGames, what }, 0);
    const old = model.clock?.games ?? 0;
    return old ? { ...line, note: `${plural(old, 'clocked game')} reviewed before the second engine line was kept: a re-review counts them here.` } : line;
  }
  if (r.games < g.clockGames) return waitingLine(base, { have: r.games, of: g.clockGames, what }, r.games);
  if (r.moves < g.cardMoves) return waitingLine(base, { have: r.moves, of: g.cardMoves, what: 'moves where only one move held' }, r.games);
  const errors = r.rushedErrors + r.slowErrors;
  if (errors < g.cardEvents) return waitingLine(base, { have: errors, of: g.cardEvents, what: 'errors where only one move held' }, r.games);
  const slow = r.moves - r.rushed;
  const counts = `${plural(r.rushedErrors, 'error')} in ${r.rushed} quick moves, ${r.slowErrors} in ${slow} slower ones`;
  const lead = `In ${r.moves} positions where only one move held, you moved quickly (under half your usual time per move) ${times(r.rushed)}`;
  const common = {
    n: r.moves,
    unit: 'moves where only one move held',
    games: r.games,
    estimate: r.ratio,
    format: 'ratio' as const,
    reference: 1,
    isFocus: false,
    evidence: evidenceOf(r.evidence),
    detail: `Quick moves: ${pct(r.share.value)} of these (90%: ${pct(r.share.lo)}–${pct(r.share.hi)}). Estimate: error rate on quick moves ÷ on slower ones.`,
  };
  if (r.ratio.lo > 1) {
    return {
      ...base,
      ...common,
      tone: 'habit',
      state: 'clear',
      text: `${lead}, and those quick moves went wrong more often: ${counts}, about ${r.ratio.value.toFixed(1)}× as often.`,
    };
  }
  if (r.ratio.hi < 1) {
    return { ...base, ...common, tone: 'strength', state: 'clear', text: `${lead}, and those quick moves held up: ${counts}.` };
  }
  return { ...base, ...common, tone: 'neutral', state: 'leaning', text: `${lead}: ${counts}; no clear difference yet.` };
}

const p100 = (x: number) => x.toFixed(1);

/**
 * Cost by type (Slice 3): win chance given away per 100 forcing moves (captures, checks, sacrifices) against per
 * 100 quiet ones. A habit, never a forcing share. People and Maia bots at one speed; style gate and flip test.
 */
function costLine(model: InsightsModel): ProfileLine {
  const base: Base = { id: 'cost-by-type', trait: 'cost-by-type', title: 'Forcing and quiet moves', group: 'human-like' };
  const c: CostByType = model.costByType;
  const g = INSIGHTS.minSample;
  const sp = c.speed ? `${SPEED_WORD[c.speed]} ` : '';
  const note = c.stockfishGames
    ? `${plural(c.stockfishGames, `${sp}game`)} against Stockfish levels left out: their weaker levels give pieces away at random.`
    : undefined;
  if (c.state === 'not-enough') {
    const need =
      c.games < g.styleGames
        ? { have: c.games, of: g.styleGames, what: `${sp}games vs people and Maia bots` }
        : c.forcing.moves < g.cardMoves
          ? { have: c.forcing.moves, of: g.cardMoves, what: 'forcing moves' }
          : { have: c.quiet.moves, of: g.cardMoves, what: 'quiet moves' };
    const line = waitingLine(base, need, c.games);
    return note ? { ...line, note } : line;
  }
  const head =
    `In ${c.games} ${sp}games against people and Maia bots, your forcing moves (captures, checks, sacrifices) gave away ` +
    `${p100(c.forcing.per100)} points of win chance per 100 moves, your quiet moves ${p100(c.quiet.per100)} ` +
    `(${c.forcing.moves} forcing, ${c.quiet.moves} quiet moves)`;
  const detail = 'Estimate: forcing minus quiet, points per 100 moves, interval clustered by game.';
  const common = {
    n: c.forcing.moves + c.quiet.moves,
    unit: 'moves',
    games: c.games,
    estimate: c.difference,
    format: 'per100' as const,
    reference: 0,
    isFocus: false,
    evidence: evidenceOf(c.evidence),
    ...(note ? { note } : {}),
  };
  if (c.state === 'clear') {
    const costlier = c.difference.lo > 0 ? 'forcing' : 'quiet';
    return { ...base, ...common, detail, tone: 'habit', state: 'clear', text: `${head}. Your ${costlier} moves cost you more.` };
  }
  const excludes = c.difference.lo > 0 || c.difference.hi < 0;
  return {
    ...base,
    ...common,
    tone: 'neutral',
    state: 'leaning',
    text: `${head}; no clear difference yet.`,
    detail: excludes
      ? `${detail} The difference moves when ${INSIGHTS.flipTest.games} games are added at either end of your range (flip test), so it stays leaning.`
      : detail,
  };
}

/** Opening approach, and the "not the problem" line when the opening clearly holds up. */
function openingLine(model: InsightsModel): ProfileLine {
  const base: Base = { id: 'openings', trait: 'openings', title: 'Your openings', group: 'all' };
  const o = model.phaseRates.find((r) => r.phase === 'O');
  const rows = model.openings.filter((r) => r.shown);
  const g = INSIGHTS.minSample;
  const games = model.ledger.games;
  if (rows.length === 0) {
    const most = Math.max(0, ...model.openings.map((r) => r.games));
    return waitingLine(base, { have: most, of: g.openingGames, what: 'games in one opening' }, games);
  }
  if (!o || !o.shown) return waitingLine(base, { have: Math.min(o?.errors ?? 0, g.cardEvents), of: g.cardEvents, what: 'errors in the opening (and 30 moves)' }, games);
  const pooled = pooledRate(model.phaseRates);
  const top = rows[0];
  const detail = `Most played: ${top.name} as ${top.color === 'w' ? 'White' : 'Black'}, ${plural(top.games, 'game')} (score ${pct(top.score.value)}).`;
  const counts = `${rate1(o.rate.value)} mistakes or worse per 100 opening moves (${o.errors} in ${o.moves}), against ${rate1(pooled)} across the whole game`;
  const common = {
    n: o.moves,
    unit: 'opening moves',
    games,
    estimate: o.rate,
    format: 'per100' as const,
    reference: pooled,
    isFocus: false,
    evidence: [],
    detail,
  };
  if (o.rate.hi < pooled) {
    return {
      ...base,
      ...common,
      tone: 'reassurance',
      state: 'clear',
      text: `Your openings are not where you lose points: ${counts}.`,
      plain: 'Your openings are not where you lose points.',
    };
  }
  if (o.rate.lo > pooled) {
    return { ...base, ...common, tone: 'habit', state: 'clear', text: `You give away more in the opening than in the rest of the game: ${counts}.` };
  }
  return { ...base, ...common, tone: 'neutral', state: 'leaning', text: `In the opening: ${counts}; no clear difference yet.` };
}

// ---- Focus, window, style ---------------------------------------------------------------------------

/** Which shown line describes the Focus, if any. */
export function focusLineId(focusId: BucketId | null | undefined, lines: ProfileLine[]): string | null {
  if (!focusId) return null;
  const has = (id: string) => lines.some((l) => l.id === id);
  if (focusId === 'conversion') return has('conversion') ? 'conversion' : null;
  if (focusId === 'time-trouble') return has('clock') ? 'clock' : null;
  const [phase, motif] = focusId.split(':') as [Phase, string];
  if (motif === 'ignored-threat' && has('threats')) return 'threats';
  if (phase === 'O' && has('openings')) {
    const line = lines.find((l) => l.id === 'openings')!;
    if (line.tone !== 'reassurance') return 'openings';
  }
  const phaseLine = lines.find((l) => l.id === 'phase');
  if (phaseLine && phaseLine.phase === phase) return 'phase';
  return null;
}

function groupNote(w: ModelWindow): string | null {
  const bots = w.opponents.maia + w.opponents.stockfish;
  return w.games > 0 && bots * 2 > w.games ? `Mostly from games against bots (${bots} of ${w.games}).` : null;
}

/** Profile from the Insights model (built with the page's filters). */
export function buildProfile(model: InsightsModel, options: ProfileOptions = {}): PlayerProfile {
  const g = INSIGHTS.minSample;
  const games = model.games;
  const humanLike = Object.entries(model.window.humanLikeBySpeed) as [Speed, number][];
  const best = humanLike.sort((a, b) => b[1] - a[1])[0];
  const focusId = options.focusId === undefined ? (model.focus?.id ?? null) : options.focusId;
  const profile: PlayerProfile = {
    status: games < g.profileGames ? 'locked' : 'open',
    games,
    needGames: Math.max(0, g.profileGames - games),
    window: model.window,
    filters: model.filters,
    groupNote: groupNote(model.window),
    lines: [],
    waiting: [],
    style: model.costByType.speed
      ? { have: model.costByType.games, of: g.styleGames, speed: model.costByType.speed }
      : { have: best?.[1] ?? 0, of: g.styleGames, speed: best?.[0] ?? null },
    focus: { id: focusId, lineId: null },
    closing: CLOSING_LINE,
  };
  if (profile.status === 'locked') return profile;
  const all = [
    ...phaseLines(model),
    threatLine(model),
    episodeLine(model, 'conversion'),
    episodeLine(model, 'saves'),
    clockLine(model),
    rushedLine(model),
    openingLine(model),
    costLine(model),
  ];
  const shown = all.filter((l) => l.state !== 'not-enough');
  const lineId = focusLineId(focusId, shown);
  profile.lines = shown.map((l) => (l.id === lineId ? { ...l, isFocus: true } : l));
  profile.waiting = all.filter((l) => l.state === 'not-enough');
  profile.focus.lineId = lineId;
  return profile;
}

// ---- what each Review style sees ----------------------------------------------------------------------

export type LearnerView = { strength: ProfileLine | null; reassurance: ProfileLine | null };

const STRENGTH_ORDER = ['conversion', 'saves', 'threats', 'phase-strength', 'clock'];

/**
 * Learner (decision §2, amendment §5): one proven strength, one reassurance, clear lines only, no numbers, and
 * nothing of style.
 */
export function learnerView(profile: PlayerProfile): LearnerView {
  const clear = profile.lines.filter((l) => l.state === 'clear' && l.plain && !STYLE_TRAITS.includes(l.trait));
  const strength = STRENGTH_ORDER.map((id) => clear.find((l) => l.id === id && l.tone === 'strength')).find((l) => l) ?? null;
  const reassurance = clear.find((l) => l.tone === 'reassurance') ?? null;
  return { strength, reassurance };
}

/** Club: clear lines, plus leaning ones (shown greyed). */
export function clubLines(profile: PlayerProfile): ProfileLine[] {
  return profile.lines.filter((l) => l.state === 'clear' || l.state === 'leaning');
}

// ---- sentences around the lines ------------------------------------------------------------------------

/** "From your 24 reviewed games, 3 Oct – 17 Oct: 18 vs Stockfish levels, 4 vs Maia bots, 2 vs people." */
export function windowText(profile: PlayerProfile, formatDate: (iso: string) => string = (iso) => iso.slice(0, 10)): string {
  const w = profile.window;
  const speed = profile.filters.speed !== 'all' ? `${SPEED_WORD[profile.filters.speed]} ` : '';
  const parts = [
    w.opponents.stockfish ? `${w.opponents.stockfish} vs Stockfish levels` : '',
    w.opponents.maia ? `${w.opponents.maia} vs Maia bots` : '',
    w.opponents.human ? `${w.opponents.human} vs people` : '',
  ].filter(Boolean);
  const dates = w.from && w.to ? (w.from.slice(0, 10) === w.to.slice(0, 10) ? `, ${formatDate(w.from)}` : `, ${formatDate(w.from)} – ${formatDate(w.to)}`) : '';
  return `From your ${w.games} reviewed ${speed}game${w.games === 1 ? '' : 's'}${dates}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}

/** Below the section gate: "n of 20". */
export function lockedText(profile: PlayerProfile): string {
  return `This opens at ${INSIGHTS.minSample.profileGames} reviewed games: ${profile.games} of ${INSIGHTS.minSample.profileGames} so far.`;
}

/** No Focus to point at: "No Focus yet: n of 20 games", or nothing stands out. */
export function noFocusText(profile: PlayerProfile): string {
  const of = INSIGHTS.minSample.focusGames;
  return profile.games < of ? `No Focus yet: ${profile.games} of ${of} games.` : 'No Focus yet: nothing stands out clearly enough to train.';
}

/** Club and Analyst: where the style lines stand (forcing and quiet moves need the style gate). */
export function styleText(profile: PlayerProfile): string {
  const s = profile.style;
  if (s.speed && s.have >= s.of) {
    return `Lines about how you play are read from your ${s.have} ${SPEED_WORD[s.speed]} games against people and Maia bots.`;
  }
  const best = s.speed ? ` (most so far: ${s.have} ${SPEED_WORD[s.speed]})` : '';
  return `Lines about how you play need ${s.of} games at one speed against people and Maia bots: not enough yet${best}.`;
}

/** Every sentence the profile can show, for the wording test. */
export function profileTexts(profile: PlayerProfile): string[] {
  const lines = [...profile.lines, ...profile.waiting];
  return [
    SECTION_TITLE,
    profile.closing,
    profile.groupNote ?? '',
    windowText(profile),
    lockedText(profile),
    noFocusText(profile),
    styleText(profile),
    ...lines.flatMap((l) => [l.title, l.text, l.plain ?? '', l.detail ?? '', l.note ?? '', l.unit]),
  ].filter(Boolean);
}
