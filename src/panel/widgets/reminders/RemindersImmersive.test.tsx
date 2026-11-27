import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderDto, ReminderListDto } from '../../../api/reminders';
import type { PanelWidget } from '../../types';
import { COMPLETE_DELAY_MS } from './useReminderData';
import { RemindersImmersive } from './RemindersImmersive';

const store = vi.hoisted(() => ({
  lists: [] as ReminderListDto[],
  items: [] as ReminderDto[],
  setCompleted: vi.fn(() => Promise.resolve()),
  unavailable: false,
}));

vi.mock('../../../hooks/useReminders', () => ({
  useReminders: () => ({ lists: store.lists, items: store.items, loaded: true, unavailable: store.unavailable }),
  useReminderMutations: () => ({ setCompleted: store.setCompleted }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params && Object.keys(params).length > 0 ? `${key}|${Object.values(params).join('|')}` : key),
    language: 'en',
  }),
}));

const NOW = new Date(2026, 10, 17, 14, 35).getTime();
const list = (id: string, name: string, order: number): ReminderListDto => ({ id, name, color: '#0a84ff', icon: 'list', order, createdAt: order });
let n = 0;
const item = (listId: string, title: string, extra: Partial<ReminderDto> = {}): ReminderDto => {
  n += 1;
  return {
    id: `i${n}`, listId, title, notes: null, dueDate: null, dueTime: null, priority: 0, flagged: false, completed: false,
    completedAt: null, url: null, order: n, createdAt: n, updatedAt: n, ...extra,
  };
};
const widget = (config?: Record<string, unknown>) => ({ id: 'w', type: 'reminders', size: '4x4', col: 0, row: 0, config }) as PanelWidget;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  store.lists = [list('l1', 'Home', 0), list('l2', 'Work', 1)];
  store.items = [item('l1', 'Water plants', { dueDate: '2026-11-17' }), item('l2', 'Send update')];
  store.setCompleted.mockClear();
  store.unavailable = false;
});
afterEach(() => vi.useRealTimers());

describe('RemindersImmersive', () => {
  it('switches between smart lists and My Lists, and checks items off', () => {
    render(<RemindersImmersive widget={widget()} />);
    expect(screen.getByText('Water plants')).toBeTruthy();
    fireEvent.click(screen.getByText('Work').closest('button')!);
    expect(screen.getByText('Send update')).toBeTruthy();
    expect(screen.queryByText('Water plants')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send update' }));
    act(() => { vi.advanceTimersByTime(COMPLETE_DELAY_MS + 1); });
    expect(store.setCompleted).toHaveBeenCalledWith(store.items[1].id, true);
    fireEvent.click(screen.getByRole('button', { name: /reminders\.smart\.all/ }));
    expect(screen.getAllByText('Home').length).toBeGreaterThan(1);
  });

  it('shows an error state while the service is unavailable', () => {
    store.unavailable = true;
    render(<RemindersImmersive widget={widget()} />);
    expect(screen.getByRole('alert').textContent).toBe('reminders.error.unavailable');
  });

  it('shows only the configured list, read only, on a display without touch', () => {
    render(<RemindersImmersive widget={widget({ list: 'l2' })} surface="q60" />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText('Send update')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Send update' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
