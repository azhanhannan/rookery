// Browser side of the Phase 5 API (types in ./types). Same origin: Vite proxies /api in dev.
import type {
  AccountResponse,
  AuthProvidersResponse,
  AuthResponse,
  CoachCommentRequest,
  CoachCommentResponse,
  CoachGameCommentsResponse,
  CoachGameResponse,
  CoachGamesResponse,
  CoachInviteResponse,
  CoachLinksResponse,
  CoachRedeemResponse,
  CoachStudentsResponse,
  CoachUnreadResponse,
  HomeworkAttemptRequest,
  HomeworkCreateRequest,
  HomeworkListResponse,
  HomeworkResponse,
  GameFilter,
  GameIdsResponse,
  GameListResponse,
  GameResponse,
  ProfileResponse,
  PuzzleAttemptRequest,
  PuzzleAttemptResponse,
  PuzzleMeResponse,
  SaveGameRequest,
  SaveGameResponse,
  StatePutRequest,
  StateResponse,
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
  listGames: (before?: string, filter: GameFilter = 'all') => {
    const q = new URLSearchParams();
    if (filter !== 'all') q.set('filter', filter);
    if (before) q.set('before', before);
    const qs = q.toString();
    return call<GameListResponse>('GET', `/games${qs ? `?${qs}` : ''}`);
  },
  gameIds: () => call<GameIdsResponse>('GET', '/games/ids'),
  getGame: (clientId: string) => call<GameResponse>('GET', `/games/${encodeURIComponent(clientId)}`),
  profile: (username: string) => call<ProfileResponse>('GET', `/profile/${encodeURIComponent(username)}`),
  puzzleAttempt: (id: string, req: PuzzleAttemptRequest) =>
    call<PuzzleAttemptResponse>('POST', `/puzzles/${encodeURIComponent(id)}/attempt`, req),
  puzzleMe: () => call<PuzzleMeResponse>('GET', '/puzzles/me'),
  getState: () => call<StateResponse>('GET', '/state'),
  putState: (req: StatePutRequest) => call<StateResponse>('PUT', '/state', req),
  coach: coachApi(),
};

/** Coach–student link (src/api/types.ts, server/src/routes/coach.ts). */
function coachApi() {
  const id = encodeURIComponent;
  const student = (s: string) => `/coach/students/${id(s)}`;
  return {
    invite: () => call<CoachInviteResponse>('POST', '/coach/invite', {}),
    redeem: (code: string) => call<CoachRedeemResponse>('POST', '/coach/redeem', { code }),
    links: () => call<CoachLinksResponse>('GET', '/coach/links'),
    unlinkCoach: (coachId: string) => call<void>('DELETE', `/coach/coaches/${id(coachId)}`),
    unlinkStudent: (studentId: string) => call<void>('DELETE', student(studentId)),
    students: () => call<CoachStudentsResponse>('GET', '/coach/students'),
    games: (studentId: string, before?: string) =>
      call<CoachGamesResponse>('GET', `${student(studentId)}/games${before ? `?before=${id(before)}` : ''}`),
    game: (studentId: string, clientId: string) => call<CoachGameResponse>('GET', `${student(studentId)}/games/${id(clientId)}`),
    comment: (studentId: string, clientId: string, req: CoachCommentRequest) =>
      call<CoachCommentResponse>('POST', `${student(studentId)}/games/${id(clientId)}/comments`, req),
    studentHomework: (studentId: string) => call<HomeworkListResponse>('GET', `${student(studentId)}/homework`),
    setHomework: (studentId: string, req: HomeworkCreateRequest) =>
      call<HomeworkResponse>('POST', `${student(studentId)}/homework`, req),
    deleteHomework: (homeworkId: string) => call<void>('DELETE', `/coach/homework/${id(homeworkId)}`),
    unread: () => call<CoachUnreadResponse>('GET', '/coach/comments/unread'),
    myComments: (clientId: string) => call<CoachGameCommentsResponse>('GET', `/coach/comments/${id(clientId)}`),
    markRead: (clientId: string) => call<void>('POST', `/coach/comments/${id(clientId)}/read`, {}),
    myHomework: () => call<HomeworkListResponse>('GET', '/coach/homework'),
    attempt: (homeworkId: string, req: HomeworkAttemptRequest) =>
      call<HomeworkResponse>('POST', `/coach/homework/${id(homeworkId)}/attempt`, req),
  };
}

/** Full-page URL that starts Google sign-in (login) or links Google to the signed-in account (link). */
export function googleSignInUrl(mode: 'login' | 'link'): string {
  return `/api/auth/google?mode=${mode}`;
}
