import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComponentMonitorSwitch } from './ComponentMonitorSwitch';

const update = vi.fn();
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../hooks/useUiSettings', () => ({ useUiSettings: () => ({ settings: mockSettings, update }) }));
vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('ComponentMonitorSwitch', () => {
  it('shows the stored value and writes the matching component field', () => {
    mockSettings = { diagnosticsComponentRam: true };
    update.mockClear();
    render(<ComponentMonitorSwitch setting="diagnosticsComponentRam" labelKey="diagnostics.monitorComponent.ram" />);
    const toggle = screen.getByRole('switch', { name: 'diagnostics.monitorComponent.ram' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(update).toHaveBeenCalledWith({ diagnosticsComponentRam: false });
  });
});
