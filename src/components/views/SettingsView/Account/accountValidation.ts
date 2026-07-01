// Client-side mirrors of the server's validation. Must stay in sync with the
// /cloud/* contract if the server-side rules change.

const USERNAME_RE = /^[A-Za-z0-9_]{4,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}
