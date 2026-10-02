import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelConfigValue, PanelWidget } from '../../types';
import { TimerSettings } from './TimerSettings';

vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void;
    options: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

function timerWidget(config?: Record<string, PanelConfigValue>): PanelWidget {
  return { id: 'timer-1', type: 'timer', size: '2x2', col: 0, row: 0, config };
}

afterEach(() => vi.restoreAllMocks());

describe('TimerSettings', () => {
  it('shows the beeper, on, ringing for 30 seconds by default', () => {
    render(<TimerSettings widget={timerWidget()} onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'panel.widget.timer.settings.playSound' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'panel.widget.timer.settings.sound' })).toHaveValue('beeper');
    expect(screen.getByRole('combobox', { name: 'panel.widget.timer.settings.ringFor' })).toHaveValue('30');
  });

  it('hides the sound pickers when the alarm is off', () => {
    render(<TimerSettings widget={timerWidget({ alarm: false })} onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'panel.widget.timer.settings.playSound' })).not.toBeChecked();
    expect(screen.queryByRole('combobox', { name: 'panel.widget.timer.settings.sound' })).toBeNull();
  });

  it('saves and previews a picked sound', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onUpdate = vi.fn();
    render(<TimerSettings widget={timerWidget()} onUpdate={onUpdate} onResize={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'panel.widget.timer.settings.sound' }), { target: { value: 'marimba' } });
    expect(onUpdate).toHaveBeenCalledWith({ alarmSound: 'marimba' });
    expect((play.mock.contexts[0] as HTMLAudioElement).src).toContain('marimba');
  });

  it('saves the ring duration as a number', () => {
    const onUpdate = vi.fn();
    render(<TimerSettings widget={timerWidget()} onUpdate={onUpdate} onResize={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'panel.widget.timer.settings.ringFor' }), { target: { value: '60' } });
    expect(onUpdate).toHaveBeenCalledWith({ alarmSeconds: 60 });
  });
});
