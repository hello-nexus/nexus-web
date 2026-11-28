import {
  AlarmClock, Bookmark, Briefcase, CalendarCheck, CalendarClock, CircleCheck, Flag, Gift, Heart, House, Inbox, List, ShoppingCart, Star,
  type LucideIcon,
} from 'lucide-react';
import { DECK_ICONS } from '../deck/deckIcons';
import type { DeckIcon } from '../deck/types';
import type { SmartListId } from './reminderLogic';

export const REMINDER_ICONS: Readonly<Record<string, LucideIcon>> = {
  list: List, bookmark: Bookmark, star: Star, heart: Heart, home: House, cart: ShoppingCart, briefcase: Briefcase, gift: Gift,
};

export const DEFAULT_REMINDER_ICON = 'list';
export const EMOJI_PREFIX = 'emoji:';

export type ListIconView = { kind: 'lucide'; Icon: LucideIcon } | { kind: 'emoji'; glyph: string };

/** A stored list icon: `emoji:<glyph>`, a deck icon name, one of the original lowercase aliases, else List. */
export function resolveListIcon(key: string): ListIconView {
  if (key.startsWith(EMOJI_PREFIX) && key.length > EMOJI_PREFIX.length) return { kind: 'emoji', glyph: key.slice(EMOJI_PREFIX.length) };
  return { kind: 'lucide', Icon: REMINDER_ICONS[key] ?? DECK_ICONS[key] ?? List };
}

// The deck picker names icons in PascalCase; these aliases are the same glyphs.
const ALIAS_DECK_NAMES: Readonly<Record<string, string>> = {
  list: 'List', bookmark: 'Bookmark', star: 'Star', heart: 'Heart', home: 'Home', cart: 'ShoppingCart', briefcase: 'Briefcase', gift: 'Gift',
};

/** The picker's value for a stored key, so the current icon shows selected. */
export function pickerValueFor(key: string): DeckIcon | undefined {
  if (key.startsWith(EMOJI_PREFIX) && key.length > EMOJI_PREFIX.length) return { kind: 'emoji', value: key.slice(EMOJI_PREFIX.length) };
  const name = DECK_ICONS[key] ? key : ALIAS_DECK_NAMES[key];
  return name ? { kind: 'lucide', value: name } : undefined;
}

/** The key stored for a picker choice. */
export const keyFromPicker = (icon: DeckIcon): string => (icon.kind === 'emoji' ? `${EMOJI_PREFIX}${icon.value}` : icon.value);

export const SMART_ICONS: Readonly<Record<SmartListId, LucideIcon>> = {
  today: CalendarCheck, scheduled: CalendarClock, overdue: AlarmClock, flagged: Flag, all: Inbox, completed: CircleCheck,
};

/** One fixed color per smart list, applied to its icon alone. */
export const SMART_COLORS: Readonly<Record<SmartListId, string>> = {
  today: '#0a84ff', scheduled: '#bf5af2', overdue: '#ff453a', flagged: '#ff9f0a', all: '#8e8e93', completed: '#8e8e93',
};

export const SMART_NAME_KEYS: Readonly<Record<SmartListId, string>> = {
  today: 'reminders.smart.today',
  scheduled: 'reminders.smart.scheduled',
  overdue: 'reminders.smart.overdue',
  flagged: 'reminders.smart.flagged',
  all: 'reminders.smart.all',
  completed: 'reminders.smart.completed',
};
