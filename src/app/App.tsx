import { lazy, Suspense, useEffect, useState } from 'react';
import { APP_NAME } from '../config/tunables';
import { AboutPage } from './AboutPage';
import { ImportPage } from './ImportPage';
import { PlayPage } from './PlayPage';

// The review screen (and Recharts) loads on first visit, keeping the play page's bundle small.
const ReviewPage = lazy(() => import('./ReviewPage').then((m) => ({ default: m.ReviewPage })));

// Hash routes keep the app servable from any static host with no rewrite rules.
const ROUTES: Record<string, () => React.JSX.Element> = {
  '#/play': PlayPage,
  '#/import': ImportPage,
  '#/about': AboutPage,
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
  // `#/review` and `#/review/<gameId>` carry a parameter, so they are matched by prefix.
  const review = hash === '#/review' || hash.startsWith('#/review/');
  const gameId = review ? decodeURIComponent(hash.slice('#/review/'.length)) || undefined : undefined;
  const Page = review ? null : (ROUTES[hash] ?? PlayPage);

  return (
    <div className="min-h-screen">
      <header className="border-b border-surface-2 bg-surface">
        <nav className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3">
          <a href="#/play" className="text-lg font-bold tracking-tight">
            {APP_NAME}
          </a>
          <a href="#/play" className={`text-sm ${Page === PlayPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>Play</a>
          <a href="#/review" className={`text-sm ${review ? 'text-ink' : 'text-muted'} hover:text-ink`}>Review</a>
          <a href="#/import" className={`text-sm ${Page === ImportPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>Import</a>
          <a href="#/about" className={`ml-auto text-sm ${Page === AboutPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>About</a>
        </nav>
      </header>
      <main>
        {Page ? (
          <Page />
        ) : (
          <Suspense fallback={<p className="p-6 text-center text-sm text-muted">Loading review…</p>}>
            <ReviewPage key={hash} gameId={gameId} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
