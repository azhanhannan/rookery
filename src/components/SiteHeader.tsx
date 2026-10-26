// The site header: the app name, the pages, and the account links. Built to stay on one line from 360 px up:
// the `primary` pages are always shown; the rest sit in a "More" menu, and inline only on very wide screens.
import type { MouseEvent } from 'react';
import { APP_NAME } from '../config/tunables';
import { isCurrent, NAV_ITEMS } from '../app/nav';
import { AccountNav } from './AccountNav';
import { OpeningsDueBadge } from './OpeningsDue';
import { useDetailsMenu } from './useDetailsMenu';

const link = (on: boolean) => `text-sm whitespace-nowrap ${on ? 'text-ink' : 'text-muted'} hover:text-ink`;

/** A menu icon: three bars. */
function Bars() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function SiteHeader({ hash }: { hash: string }) {
  const more = NAV_ITEMS.filter((i) => !i.primary);
  const moreCurrent = more.find((i) => isCurrent(i, hash));
  const menu = useDetailsMenu();
  const close = (e: MouseEvent<HTMLElement>) => e.currentTarget.closest('details')?.removeAttribute('open');

  return (
    <header className="border-b border-surface-2 bg-surface">
      <nav className="mx-auto flex max-w-7xl flex-nowrap items-center gap-x-2.5 px-4 py-3 sm:gap-x-5">
        <a href="#/play" className="shrink-0 text-base font-bold tracking-tight sm:text-lg">
          {APP_NAME}
        </a>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`${link(isCurrent(item, hash))} ${item.primary ? '' : 'hidden 2xl:inline'}`}
            aria-current={isCurrent(item, hash) ? 'page' : undefined}
          >
            {item.label}
            {item.href === '#/openings' && <OpeningsDueBadge />}
          </a>
        ))}
        <details ref={menu} className="relative 2xl:hidden">
          <summary
            className={`flex cursor-pointer list-none items-center gap-1 ${link(!!moreCurrent)} [&::-webkit-details-marker]:hidden`}
            aria-label="More pages"
          >
            <span className="sm:hidden">
              <Bars />
            </span>
            <span className="hidden sm:inline">{moreCurrent ? moreCurrent.label : 'More'} ▾</span>
            <OpeningsDueBadge dot />
          </summary>
          <div className="absolute right-0 z-30 mt-2 flex min-w-[9rem] flex-col gap-3 rounded-lg bg-surface p-3 shadow-lg ring-1 ring-surface-2">
            {more.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={link(isCurrent(item, hash))}
                aria-current={isCurrent(item, hash) ? 'page' : undefined}
                onClick={close}
              >
                {item.label}
                {item.href === '#/openings' && <OpeningsDueBadge />}
              </a>
            ))}
          </div>
        </details>
        <span className="ml-auto" />
        <AccountNav />
      </nav>
    </header>
  );
}
