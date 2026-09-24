// Public account profiles live on the Build portal.
export const PUBLIC_PROFILE_ORIGIN = 'https://build.hellonexus.com';

export function publicProfileUrl(username: string): string {
  return `${PUBLIC_PROFILE_ORIGIN}/u/${encodeURIComponent(username)}`;
}
