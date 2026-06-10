// Catalog preview fixture — fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: every tab/list
// the widget can show at any size renders from this. Keep in sync with what
// SteamWidget renders (see .agents/rules/widget-preview-fixtures.md in the
// master repo). No current game: the Playing banner is an external CDN URL the
// preview must never load, so the coherent state is "online, not in a game".
import type {
  SteamAchievement,
  SteamFriendSummary,
  SteamOwnedGame,
  SteamPlayerSummary,
  SteamRecentGame,
  SteamStatusResponse,
} from '../../../api/steam';
import { previewAvatarUri } from '../common/previewAssets';

interface SteamPreviewData {
  status: SteamStatusResponse;
  profile: SteamPlayerSummary;
  level: number;
  recentGames: SteamRecentGame[];
  ownedGames: SteamOwnedGame[];
  friends: SteamFriendSummary[];
  achievements: SteamAchievement[];
}

// iconHash stays '' — steamIconUrl() builds an external media URL from it, so
// the empty hash routes rows to the built-in gameIconFallback.
const game = (appId: number, name: string, twoWeeks: number, forever: number): SteamRecentGame =>
  ({ appId, name, playtime2Weeks: twoWeeks, playtimeForever: forever, iconHash: '' });

const RECENT_GAMES: SteamRecentGame[] = [
  game(101, 'Star Voyager', 754, 9_310),
  game(102, 'Driftline', 412, 2_280),
  game(103, 'Ashen Keep', 298, 12_640),
  game(104, 'Hexa Tactics', 173, 845),
  game(105, 'Skybound Rally', 122, 3_905),
  game(106, 'Iron Harvest Moon', 96, 1_410),
  game(107, 'Neon Abyss Divers', 64, 530),
  game(108, 'Quiet Horizon', 41, 7_215),
];

const friend = (
  steamId: string, personaName: string, hue: number,
  personaState: SteamFriendSummary['personaState'], gameExtraInfo: string | null,
): SteamFriendSummary =>
  ({ steamId, personaName, avatarMedium: previewAvatarUri(hue), personaState, gameExtraInfo, friendSince: 1_500_000_000 });

export const STEAM_PREVIEW: SteamPreviewData = {
  status: { error: false, msg: '', ready: true, hasApiKey: true, steamId: '76561190000000000', reason: '' },
  profile: {
    steamId: '76561190000000000',
    personaName: 'Nova',
    profileUrl: '',
    avatar: previewAvatarUri(210),
    avatarMedium: previewAvatarUri(210),
    avatarFull: previewAvatarUri(210),
    personaState: 1,
    communityVisibilityState: 3,
    lastLogoff: null,
    gameExtraInfo: null,
    gameId: null,
  },
  level: 42,
  recentGames: RECENT_GAMES,
  ownedGames: RECENT_GAMES.map(g => ({ ...g })),
  friends: [
    friend('1', 'Vex', 12, 1, 'Star Voyager'),
    friend('2', 'Marlowe', 96, 1, null),
    friend('3', 'Juniper', 156, 3, null),
    friend('4', 'Castor', 264, 2, null),
    friend('5', 'Wren', 318, 1, 'Driftline'),
    friend('6', 'Halcyon', 48, 0, null),
  ],
  // Coherent with "not in a game": the achievements bar only renders for the
  // active game, so the full-state snapshot carries none.
  achievements: [],
};
