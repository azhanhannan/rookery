import type { MouseEvent } from 'react';
import { useAuthStore } from '../account/authStore';

const link = 'text-sm text-muted hover:text-ink';

/** Closes the phone menu once one of its entries is used (the header stays mounted across routes). */
function closeMenu(e: MouseEvent<HTMLElement>) {
  e.currentTarget.closest('details')?.removeAttribute('open');
}

// Right side of the header. Signed out: Log in / Sign up. Signed in: username (profile), My games, Log out.
// On phones the signed-in links fold into a small menu so the header stays on one line.
export function AccountNav() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (status !== 'signed-in' || !user) {
    return (
      <div className="flex items-center gap-3">
        {status === 'offline' && (
          <span className="hidden text-xs text-muted sm:inline" title="The server can't be reached. Games stay on this device.">
            offline
          </span>
        )}
        <a href="#/login" className={link}>Log in</a>
        {/* Phones: the login page links to sign-up, which keeps the header on one line. */}
        <a href="#/signup" className={`${link} hidden sm:inline`}>Sign up</a>
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
      <div className="hidden items-center gap-3 sm:flex">{entries()}</div>
      <details className="relative sm:hidden">
        <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          Account ▾
        </summary>
        <div className="absolute right-0 z-30 mt-2 flex min-w-[9rem] flex-col gap-3 rounded-lg bg-surface p-3 shadow-lg ring-1 ring-surface-2">
          {entries(closeMenu)}
        </div>
      </details>
    </>
  );
}
