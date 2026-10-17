import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { SiteHeader } from '../components/SiteHeader';
import { APP_NAME } from '../config/tunables';
import { useFocusMode } from './focusMode';
import { mistakesMotifFromHash, parseReviewHash, subPath } from './deepLinks';
import { AboutPage } from './AboutPage';
import { AccountPage } from './AccountPage';
import { AuthPage } from './AuthPage';
import { GamesPage } from './GamesPage';
import { ImportPage } from './ImportPage';
import { PlayPage } from './PlayPage';

// The review screen (and Recharts) loads on first visit, keeping the play page's bundle small.
const ReviewPage = lazy(() => import('./ReviewPage').then((m) => ({ default: m.ReviewPage })));
// The profile's rating graph uses Recharts too.
// Puzzles fetch their data at runtime; the page itself is small but kept out of the main bundle too.
const PuzzlesPage = lazy(() => import('./PuzzlesPage').then((m) => ({ default: m.PuzzlesPage })));
const ProfilePage = lazy(() => import('./ProfilePage').then((m) => ({ default: m.ProfilePage })));
// The Analysis board (variation tree, PGN tools, position editor) loads on first visit too.
const AnalysisPage = lazy(() => import('./AnalysisPage').then((m) => ({ default: m.AnalysisPage })));
const AnalysisRoute = () => (
  <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading analysis…</p>}>
    <AnalysisPage />
  </Suspense>
);

// The opening trainer (repertoires + drill) loads on first visit too.
const OpeningsPage = lazy(() => import('./OpeningsPage').then((m) => ({ default: m.OpeningsPage })));
const OpeningsRoute = () => (
  <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading openings…</p>}>
    <OpeningsPage />
  </Suspense>
);

// Endgame drills load on first visit too.
const EndgamesPage = lazy(() => import('./EndgamesPage').then((m) => ({ default: m.EndgamesPage })));
const EndgamesRoute = () => (
  <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading endgames…</p>}>
    <EndgamesPage key={location.hash} drillId={subPath(location.hash, '#/endgames') ?? undefined} />
  </Suspense>
);

// Training drills (name the square) load on first visit too.
const DrillsPage = lazy(() => import('./DrillsPage').then((m) => ({ default: m.DrillsPage })));
const DrillsRoute = () => (
  <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading drills…</p>}>
    <DrillsPage />
  </Suspense>
);

// Coach–student link (#/coach…) loads on first visit too.
const CoachPage = lazy(() => import('./CoachPage').then((m) => ({ default: m.CoachPage })));

// Lessons load on first visit too.
const LessonsPage = lazy(() => import('./LessonsPage').then((m) => ({ default: m.LessonsPage })));
const LessonsRoute = () => (
  <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading lessons…</p>}>
    <LessonsPage key={location.hash} lessonId={subPath(location.hash, '#/lessons') ?? undefined} />
  </Suspense>
);

// Insights (#/insights) load on first visit too.
const InsightsPage = lazy(() => import('./InsightsPage').then((m) => ({ default: m.InsightsPage })));
const InsightsRoute = () => (
  <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading insights…</p>}>
    <InsightsPage />
  </Suspense>
);

const LoginPage = () => <AuthPage mode="login" />;
const SignupPage = () => <AuthPage mode="signup" />;

// Hash routes keep the app servable from any static host with no rewrite rules.
const ROUTES: Record<string, () => React.JSX.Element> = {
  '#/play': PlayPage,
  '#/import': ImportPage,
  '#/about': AboutPage,
  '#/login': LoginPage,
  '#/signup': SignupPage,
  '#/games': GamesPage,
  '#/account': AccountPage,
  '#/analysis': AnalysisRoute,
  '#/openings': OpeningsRoute,
  '#/endgames': EndgamesRoute,
  '#/drills': DrillsRoute,
  '#/lessons': LessonsRoute,
  '#/insights': InsightsRoute,
};

/** Pages that take an id below them (`#/lessons/forks`, `#/endgames/kqk`): the route to look up. */
function routeKey(hash: string): string {
  for (const base of ['#/lessons', '#/endgames']) if (hash.startsWith(`${base}/`)) return base;
  return hash;
}

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const refreshAuth = useAuthStore((s) => s.refresh);
  useEffect(() => {
    void refreshAuth();
    // While the server is unreachable, check again every 15 s and whenever the tab regains focus,
    // so starting the server later clears "offline" without a reload.
    const retry = () => {
      if (useAuthStore.getState().status === 'offline') void refreshAuth();
    };
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener('focus', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', retry);
    };
  }, [refreshAuth]);
  // `#/review` and `#/review/<gameId>` carry a parameter, so they are matched by prefix.
  const review = hash === '#/review' || hash.startsWith('#/review/');
  // `#/review/<id>?ply=<n>` opens the review at that move (Insights' evidence links).
  const { gameId, ply: reviewPly } = parseReviewHash(hash);
  // `#/profile/<username>` likewise.
  const profileName = hash.startsWith('#/profile/') ? decodeURIComponent(hash.slice('#/profile/'.length)) : null;
  // `#/puzzles/mistakes/<motif>`: My mistakes for one motif (Insights' Train this).
  const puzzles = hash === '#/puzzles' || hash.startsWith('#/puzzles/');
  // `#/coach` and `#/coach/<...>`.
  const coachPath = hash === '#/coach' || hash.startsWith('#/coach/') ? hash.slice('#/coach'.length) : null;
  const Page = review || profileName || puzzles || coachPath !== null ? null : (ROUTES[routeKey(hash)] ?? PlayPage);
  // Full screen exists on the board pages only.
  const boardPage = Page === PlayPage || review || puzzles || Page === AnalysisRoute || Page === OpeningsRoute;
  const focus = useFocusMode((s) => s.on) && boardPage;
  useEffect(() => {
    if (!boardPage && useFocusMode.getState().on) useFocusMode.getState().exit();
  }, [boardPage]);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-focus', focus);
  }, [focus]);
  // "F" toggles full screen on board pages (not while typing).
  useEffect(() => {
    if (!boardPage) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.closest('input, textarea, select, [contenteditable]')) return;
      useFocusMode.getState().toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardPage]);

  return (
    <div className="min-h-screen">
      {!focus && <SiteHeader hash={hash} />}
      <main>
        {Page ? (
          <Page />
        ) : puzzles ? (
          <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading puzzles…</p>}>
            <PuzzlesPage key={hash} mistakesMotif={mistakesMotifFromHash(hash) ?? undefined} />
          </Suspense>
        ) : coachPath !== null ? (
          <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading coach…</p>}>
            <CoachPage path={coachPath} />
          </Suspense>
        ) : profileName ? (
          <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading profile…</p>}>
            <ProfilePage key={hash} username={profileName} />
          </Suspense>
        ) : (
          <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading review…</p>}>
            <ReviewPage key={hash} gameId={gameId} initialPly={reviewPly} />
          </Suspense>
        )}
      </main>
      <footer className={`px-4 py-6 text-center sm:hidden ${focus ? 'hidden' : ''}`}>
        <a href="#/import" className="text-sm text-muted hover:text-ink">Import PGN</a>
        <span className="mx-2 text-muted">·</span>
        <a href="#/about" className="text-sm text-muted hover:text-ink">About {APP_NAME}</a>
      </footer>
    </div>
  );
}
