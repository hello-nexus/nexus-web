// Catalog preview fixture - fake server payloads, untranslated by design.
// ONE complete size-independent snapshot: the 4x4 tile and the 2x4 q-series
// tile both slice this same list, and it carries a coloured name, an uncoloured
// name, and an emote run so every render branch is exercised
// (previewMode.test.tsx is the fixture-sync gate).
import type { TwitchChatFrame } from '../../../api/twitch';

export const TWITCH_PREVIEW_CHANNEL = 'nova_streams';

export const TWITCH_PREVIEW: TwitchChatFrame = {
  channel: TWITCH_PREVIEW_CHANNEL,
  connected: true,
  exists: true,
  clearedThrough: 0,
  messages: [
    {
      seq: 1,
      user: 'pixel_kat',
      color: '#7BD0FF',
      fragments: [{ text: 'that last round was clean', emoteId: '' }],
    },
    {
      seq: 2,
      user: 'mod_dan',
      color: '#57D9A3',
      fragments: [{ text: 'welcome in everyone', emoteId: '' }],
    },
    {
      seq: 3,
      user: 'sora',
      // No colour set: exercises the fallback tint derived from the name.
      color: '',
      fragments: [
        { text: 'gg ', emoteId: '' },
        { text: 'Kappa', emoteId: '25' },
      ],
    },
    {
      seq: 4,
      user: 'viewer_42',
      color: '#FF7BC0',
      fragments: [{ text: 'glhf', emoteId: '' }],
    },
  ],
};
