import type { ReactNode } from 'react';
import {
  BookOpen, Briefcase, Clapperboard, Focus, Gamepad2, Headphones,
  Moon, Music, Radio, Video,
} from 'lucide-react';

/**
 * Icon set a focus mode can pick from. Keyed by a stable string because the
 * service persists the key, not a component.
 */
export const FOCUS_ICON_KEYS = [
  'focus', 'gamepad', 'broadcast', 'video', 'briefcase',
  'moon', 'music', 'headphones', 'movie', 'reading',
] as const;

export type FocusIconKey = (typeof FOCUS_ICON_KEYS)[number];

export function focusIcon(key: string, size = 16): ReactNode {
  switch (key) {
    case 'gamepad': return <Gamepad2 size={size} />;
    case 'broadcast': return <Radio size={size} />;
    case 'video': return <Video size={size} />;
    case 'briefcase': return <Briefcase size={size} />;
    case 'moon': return <Moon size={size} />;
    case 'music': return <Music size={size} />;
    case 'headphones': return <Headphones size={size} />;
    case 'movie': return <Clapperboard size={size} />;
    case 'reading': return <BookOpen size={size} />;
    default: return <Focus size={size} />;
  }
}
