import { create } from 'zustand';
import { api } from '../api/client';
import type { PublicUser } from '../api/types';

type AuthState = {
  /** 'unknown' until the first /me answers; 'offline' when the server can't be reached (the app still works). */
  status: 'unknown' | 'signed-out' | 'signed-in' | 'offline';
  user: PublicUser | null;
  /** Asks the server who is signed in. Called once at start-up. */
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Changes the username (throws ApiError for the form to show). */
  rename: (username: string) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,

  async refresh() {
    try {
      const { user } = await api.me();
      set({ status: 'signed-in', user });
    } catch (e) {
      const status = (e as { status?: number }).status;
      set({ status: status === 401 ? 'signed-out' : 'offline', user: null });
    }
  },

  // login/signup throw ApiError for the form to show.
  async login(username, password) {
    const { user } = await api.login(username, password);
    set({ status: 'signed-in', user });
  },

  async signup(username, password) {
    const { user } = await api.signup(username, password);
    set({ status: 'signed-in', user });
  },

  async rename(username) {
    const { user } = await api.rename(username);
    set({ status: 'signed-in', user });
  },

  async logout() {
    await api.logout().catch(() => {});
    set({ status: 'signed-out', user: null });
  },
}));
