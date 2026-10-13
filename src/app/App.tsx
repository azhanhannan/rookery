import { useEffect, useState } from 'react';
import { APP_NAME } from '../config/tunables';
import { AboutPage } from './AboutPage';
import { ImportPage } from './ImportPage';
import { PlayPage } from './PlayPage';

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
  const Page = ROUTES[hash] ?? PlayPage;

  return (
    <div className="min-h-screen">
      <header className="border-b border-surface-2 bg-surface">
        <nav className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3">
          <a href="#/play" className="text-lg font-bold tracking-tight">
            {APP_NAME}
          </a>
          <a href="#/play" className={`text-sm ${Page === PlayPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>Play</a>
          <a href="#/import" className={`text-sm ${Page === ImportPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>Import</a>
          <a href="#/about" className={`ml-auto text-sm ${Page === AboutPage ? 'text-ink' : 'text-muted'} hover:text-ink`}>About</a>
        </nav>
      </header>
      <main>
        <Page />
      </main>
    </div>
  );
}
