// Browser side of the Phase 5 API (types in ./types). Same origin: Vite proxies /api in dev.
import type {
  AccountResponse,
  AuthProvidersResponse,
  AuthResponse,
  GameListResponse,
  GameResponse,
  ProfileResponse,
  PuzzleAttemptRequest,
  PuzzleAttemptResponse,
  PuzzleMeResponse,
  SaveGameRequest,
  SaveGameResponse,
} from './types';

/** A failed API call. `status` 0 means the server couldn't be reached. `message` is player-readable. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Your games are still saved on this device.");
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Server error (${res.status}).`);
  return data as T;
}

export const api = {
  signup: (username: string, password: string) => call<AuthResponse>('POST', '/auth/signup', { username, password }),
  login: (username: string, password: string) => call<AuthResponse>('POST', '/auth/login', { username, password }),
  logout: () => call<void>('POST', '/auth/logout', {}),
  me: () => call<AuthResponse>('GET', '/auth/me'),
  providers: () => call<AuthProvidersResponse>('GET', '/auth/providers'),
  account: () => call<AccountResponse>('GET', '/auth/account'),
  rename: (username: string) => call<AuthResponse>('PATCH', '/auth/me', { username }),
  saveGame: (req: SaveGameRequest) =>
    call<SaveGameResponse>('PUT', `/games/${encodeURIComponent(req.record.id)}`, req),
  listGames: (before?: string) =>
    call<GameListResponse>('GET', `/games${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  getGame: (clientId: string) => call<GameResponse>('GET', `/games/${encodeURIComponent(clientId)}`),
  profile: (username: string) => call<ProfileResponse>('GET', `/profile/${encodeURIComponent(username)}`),
  puzzleAttempt: (id: string, req: PuzzleAttemptRequest) =>
    call<PuzzleAttemptResponse>('POST', `/puzzles/${encodeURIComponent(id)}/attempt`, req),
  puzzleMe: () => call<PuzzleMeResponse>('GET', '/puzzles/me'),
};

/** Full-page URL that starts Google sign-in (login) or links Google to the signed-in account (link). */
export function googleSignInUrl(mode: 'login' | 'link'): string {
  return `/api/auth/google?mode=${mode}`;
}
