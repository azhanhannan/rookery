import { RATINGS } from '../../../src/config/tunables';

/** In-memory failed-login counter per key (username + IP). Resets on restart, which is fine for one server. */
export class LoginThrottle {
  private failures = new Map<string, { count: number; since: number }>();
  private max: number;
  private windowMs: number;

  constructor(max = RATINGS.loginAttempts.max, windowMs = RATINGS.loginAttempts.windowMs) {
    this.max = max;
    this.windowMs = windowMs;
  }

  blocked(key: string, now = Date.now()): boolean {
    const f = this.failures.get(key);
    if (!f) return false;
    if (now - f.since > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return f.count >= this.max;
  }

  fail(key: string, now = Date.now()): void {
    const f = this.failures.get(key);
    if (!f || now - f.since > this.windowMs) this.failures.set(key, { count: 1, since: now });
    else f.count++;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
