// Wire enum shared with nexus-api's /games/scores module and nexus-service's
// /cloud/games/scores proxy. Kept from Nexus 2's game type strings.
export type GameType = 'snake-easy' | 'snake-medium' | 'snake-hard' | 'block';

// null username = a private account or an anonymous (installId-keyed) entry;
// rendered client-side as a localized "Anonymous" label, never by falling
// back to a client-supplied name.
export interface GameLeaderboardEntry {
  rank: number;
  username: string | null;
  score: number;
}

export interface GameScoresResponse {
  total: number;
  entries: GameLeaderboardEntry[];
}
