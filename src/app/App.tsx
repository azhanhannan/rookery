import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { AccountNav } from '../components/AccountNav';
import { APP_NAME } from '../config/tunables';
import { useFocusMode } from './focusMode';
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
    <EndgamesPage />
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
    <LessonsPage />
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
};

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
  const gameId = review ? decodeURIComponent(hash.slice('#/review/'.length)) || undefined : undefined;
  // `#/profile/<username>` likewise.
  const profileName = hash.startsWith('#/profile/') ? decodeURIComponent(hash.slice('#/profile/'.length)) : null;
  const puzzles = hash === '#/puzzles';
  // `#/coach` and `#/coach/<...>`.
  const coachPath = hash === '#/coach' || hash.startsWith('#/coach/') ? hash.slice('#/coach'.length) : null;
  const Page = review || profileName || puzzles || coachPath !== null ? null : (ROUTES[hash] ?? PlayPage);
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
      {!focus && (
        <header className="border-b border-surface-2 bg-surface">
          <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-5">
            <a href="#/play" className="text-lg font-bold tracking-tight">
              {APP_NAME}
            </a>
            <a href="#/play" className={`text-sm ${Page === PlayPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>Play</a>
            <a href="#/review" className={`text-sm ${review ? 'text-ink' : 'text-muted'} hover:text-ink`}>Review</a>
            <a href="#/puzzles" className={`text-sm ${puzzles ? 'text-ink' : 'text-muted'} hover:text-ink`}>Puzzles</a>
            <a href="#/analysis" className={`text-sm ${Page === AnalysisRoute ? 'text-ink' : 'text-muted'} hover:text-ink`}>Analysis</a>
            <a href="#/openings" className={`text-sm ${Page === OpeningsRoute ? 'text-ink' : 'text-muted'} hover:text-ink`}>Openings</a>
            <a href="#/endgames" className={`text-sm ${Page === EndgamesRoute ? 'text-ink' : 'text-muted'} hover:text-ink`}>Endgames</a>
            <a href="#/drills" className={`text-sm ${Page === DrillsRoute ? 'text-ink' : 'text-muted'} hover:text-ink`}>Drills</a>
            <a href="#/lessons" className={`text-sm ${Page === LessonsRoute ? 'text-ink' : 'text-muted'} hover:text-ink`}>Lessons</a>
            <a href="#/import" className={`hidden text-sm sm:inline ${Page === ImportPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>Import</a>
            <span className="ml-auto" />
            <AccountNav />
            {/* Phones: Import and About move to the footer so the header stays on one line. */}
            <a href="#/about" className={`hidden text-sm sm:inline ${Page === AboutPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>About</a>
          </nav>
        </header>
      )}
      <main>
        {Page ? (
          <Page />
        ) : puzzles ? (
          <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading puzzles…</p>}>
            <PuzzlesPage />
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
            <ReviewPage key={hash} gameId={gameId} />
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
