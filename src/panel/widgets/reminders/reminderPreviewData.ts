import type { ReminderDto, ReminderListDto, ReminderPriority } from '../../../api/reminders';
import { addIsoDays, isoDate } from './reminderLogic';

// Catalog preview fixture: untranslated sample content, relative to `now`.
export const PREVIEW_LISTS: ReminderListDto[] = [
  { id: 'preview-reminders', name: 'Reminders', color: '#0a84ff', icon: 'list', order: 0, createdAt: 0 },
  { id: 'preview-groceries', name: 'Groceries', color: '#ff9f0a', icon: 'cart', order: 1, createdAt: 1 },
  { id: 'preview-work', name: 'Work', color: '#8b7cff', icon: 'briefcase', order: 2, createdAt: 2 },
];

function item(
  id: string, listId: string, title: string, order: number,
  extra: Partial<Pick<ReminderDto, 'dueDate' | 'dueTime' | 'flagged' | 'notes' | 'completed'>> & { priority?: ReminderPriority } = {},
): ReminderDto {
  const completed = extra.completed ?? false;
  return {
    id, listId, title, notes: extra.notes ?? null, dueDate: extra.dueDate ?? null, dueTime: extra.dueTime ?? null,
    priority: extra.priority ?? 0, flagged: extra.flagged ?? false, completed, completedAt: completed ? 1 : null,
    url: null, order, createdAt: order, updatedAt: order,
  };
}

export function buildPreviewReminders(now: number): ReminderDto[] {
  const today = isoDate(now);
  const day = (offset: number) => addIsoDays(today, offset);
  return [
    item('pv1', 'preview-reminders', 'Call the dentist', 0, { dueDate: day(-1), priority: 2 }),
    item('pv2', 'preview-reminders', 'Pick up the parcel', 1, { dueDate: today, dueTime: '17:30', flagged: true }),
    item('pv3', 'preview-reminders', 'Renew passport', 2, { dueDate: day(6), notes: 'Bring two photos' }),
    item('pv4', 'preview-groceries', 'Oat milk', 0, { dueDate: today }),
    item('pv5', 'preview-groceries', 'Coffee beans', 1),
    item('pv6', 'preview-groceries', 'Lemons', 2),
    item('pv7', 'preview-work', 'Send the weekly update', 0, { dueDate: day(1), dueTime: '09:00', priority: 3 }),
    item('pv8', 'preview-work', 'Review the design draft', 1, { flagged: true }),
    item('pv9', 'preview-reminders', 'Water the plants', 3, { completed: true }),
  ];
}
