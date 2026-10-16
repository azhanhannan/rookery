import { useAuthStore } from '../account/authStore';
import { useStateSync } from './stateSync';

/** Settings: one line saying where board, play and review settings and training progress are kept. */
export function SyncNote({ className = '' }: { className?: string }) {
  const status = useAuthStore((s) => s.status);
  const state = useStateSync((s) => s.state);
  const signedIn = status === 'signed-in';
  return (
    <p className={`text-sm text-muted ${className}`} data-testid="sync-note">
      {signedIn ? (
        <>
          Saved to your account
          {state === 'error' && <span>: can’t reach the server right now, saved on this device and will retry</span>}
        </>
      ) : (
        <>
          Saved on this device only —{' '}
          {status === 'offline' ? (
            'the server can’t be reached right now'
          ) : (
            <>
              <a href="#/login" className="text-accent hover:underline">sign in</a> to keep it everywhere
            </>
          )}
        </>
      )}
    </p>
  );
}
