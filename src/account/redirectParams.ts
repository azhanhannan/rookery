import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Reads a query parameter the server's Google sign-in redirect put before the hash
 * (`/?authError=…#/login`) and removes it from the address bar, so a reload doesn't show it again.
 */
export function takeRedirectParam(name: 'authError' | 'welcome'): string | null {
  const params = new URLSearchParams(location.search);
  const value = params.get(name);
  if (value === null) return null;
  params.delete(name);
  const q = params.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  return value;
}

/** Whether the server has Google sign-in configured (false until it answers, or when it can't be reached). */
export function useGoogleEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .providers()
      .then((p) => live && setOn(p.google))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return on;
}
