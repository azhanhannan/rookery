import type { MouseEvent } from 'react';
import { useAuthStore } from '../account/authStore';
import { useCoachBadge, useCoachBadgePolling } from '../coach/coachStore';

const link = 'text-sm text-muted hover:text-ink';

/** Closes the phone menu once one of its entries is used (the header stays mounted across routes). */
function closeMenu(e: MouseEvent<HTMLElement>) {
  e.currentTarget.closest('details')?.removeAttribute('open');
}

// Right side of the header. Signed out: Log in / Sign up. Signed in: username (profile), My games, Log out.
// Below lg the signed-in links fold into a small menu (a person icon on phones) so the header stays on one line.
export function AccountNav() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  useCoachBadgePolling();
  // Unread coach comments plus unfinished homework.
  const coachBadge = useCoachBadge((s) => s.unread.count + s.homeworkOpen);

  if (status !== 'signed-in' || !user) {
    return (
      <div className="flex items-center gap-3">
        {status === 'offline' && (
          <span className="hidden text-xs text-muted sm:inline" title="The server can't be reached. Games stay on this device.">
            offline
          </span>
        )}
        <a href="#/login" className={`${link} whitespace-nowrap`}>Log in</a>
        {/* Phones: the login page links to sign-up, which keeps the header on one line. */}
        <a href="#/signup" className={`${link} hidden sm:inline`}>Sign up</a>
        <a href="#/account" className={`${link} hidden sm:inline`}>Settings</a>
      </div>
    );
  }

  const profile = `#/profile/${encodeURIComponent(user.username)}`;
  const entries = (onClick?: (e: MouseEvent<HTMLElement>) => void) => (
    <>
      <a href={profile} className={`${link} max-w-[10rem] truncate font-medium text-ink`} onClick={onClick}>
        {user.username}
      </a>
      <a href="#/games" className={link} onClick={onClick}>My games</a>
      <a href="#/coach" className={link} onClick={onClick} data-testid="nav-coach">
        Coach
        {coachBadge > 0 && (
          <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink" aria-label={`${coachBadge} new from your coach`}>
            {coachBadge}
          </span>
        )}
      </a>
      <a href="#/account" className={link} onClick={onClick}>Settings</a>
      <button
        type="button"
        className={`${link} text-left`}
        onClick={(e) => {
          onClick?.(e);
          void logout();
        }}
      >
        Log out
      </button>
    </>
  );

  return (
    <>
      <div className="hidden items-center gap-3 lg:flex">{entries()}</div>
      <details className="relative lg:hidden">
        <summary
          className="flex cursor-pointer list-none items-center text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden"
          aria-label="Account"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 sm:hidden" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="10" cy="7" r="3.2" />
            <path d="M3.8 17c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5" strokeLinecap="round" />
          </svg>
          <span className="hidden whitespace-nowrap sm:inline">Account ▾</span>
        </summary>
        <div className="absolute right-0 z-30 mt-2 flex min-w-[9rem] flex-col gap-3 rounded-lg bg-surface p-3 shadow-lg ring-1 ring-surface-2">
          {entries(closeMenu)}
        </div>
      </details>
    </>
  );
}
