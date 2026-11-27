import {
  Bookmark, Briefcase, CalendarCheck, CalendarClock, CalendarDays, Check, Flag, Gift, Heart, House, Inbox, List, ShoppingCart, Star,
  type LucideIcon,
} from 'lucide-react';
import type { SmartListId } from './reminderLogic';

export const REMINDER_ICONS: Readonly<Record<string, LucideIcon>> = {
  list: List, bookmark: Bookmark, star: Star, heart: Heart, home: House, cart: ShoppingCart, briefcase: Briefcase, gift: Gift,
};

export const REMINDER_ICON_KEYS: readonly string[] = Object.keys(REMINDER_ICONS);
export const DEFAULT_REMINDER_ICON = 'list';

export const reminderIcon = (key: string): LucideIcon => REMINDER_ICONS[key] ?? List;

export const SMART_ICONS: Readonly<Record<SmartListId, LucideIcon>> = {
  today: CalendarDays, scheduled: CalendarClock, all: Inbox, flagged: Flag, completed: Check,
};

export const SMART_ROW_ICONS: Readonly<Record<SmartListId, LucideIcon>> = { ...SMART_ICONS, today: CalendarCheck };

export const SMART_COLORS: Readonly<Record<SmartListId, string>> = {
  today: '#0a84ff', scheduled: '#ff453a', all: '#8e8e93', flagged: '#ff9f0a', completed: '#8e8e93',
};

export const SMART_NAME_KEYS: Readonly<Record<SmartListId, string>> = {
  today: 'reminders.smart.today',
  scheduled: 'reminders.smart.scheduled',
  all: 'reminders.smart.all',
  flagged: 'reminders.smart.flagged',
  completed: 'reminders.smart.completed',
};
