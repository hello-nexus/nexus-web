import type { AuthAccount } from './authBackend';

/** What the public pages remember of the account between visits, to draw before the session check answers. */
export type AccountHint = Pick<AuthAccount, 'username' | 'avatar'>;

export const HINT_KEY = 'nexus_account_hint';

/** The last-known account (null: last seen signed out; undefined: nothing remembered). No email or id is kept. */
export function readAccountHint(): AccountHint | null | undefined {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) return null;
    if (typeof parsed === 'object' && typeof (parsed as AccountHint).username === 'string') {
      const { username, avatar } = parsed as AccountHint;
      return { username, avatar: avatar ?? null };
    }
  } catch { /* storage unavailable or malformed: no hint */ }
  return undefined;
}

export function writeAccountHint(account: AuthAccount | null): void {
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify(account ? { username: account.username, avatar: account.avatar } : null));
  } catch { /* storage unavailable: the next visit paints without a hint */ }
}

/** Called wherever the session ends, so a signed-out browser never paints the old account. */
export function clearAccountHint(): void {
  try {
    window.localStorage.removeItem(HINT_KEY);
  } catch { /* storage unavailable: nothing to clear */ }
}
