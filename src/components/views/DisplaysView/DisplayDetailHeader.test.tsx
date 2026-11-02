import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TopologyDisplay } from '../../../api/displays';
import { DisplayDetailHeader } from './DisplayDetailHeader';
import { displaySubtitle } from './displaySubtitle';

const disp = (over: Partial<TopologyDisplay>): TopologyDisplay => ({
  id: 'd', number: 1, name: 'DELL U2723QE', manufacturer: 'DEL', model: 'U2723QE', bounds: null, resolution: { width: 1, height: 1 },
  scaleFactor: null, dpi: null, isPrimary: false, isInternal: false, isTouch: false, orientation: '', isY70: false,
  ddcEnabled: true, hostingSupported: true, ownedByDevicePanel: false, assignedPanelDeviceId: null, assignedPanelName: null, ...over,
});

describe('displaySubtitle', () => {
  it('is empty when the name already carries the model', () => {
    expect(displaySubtitle(disp({}))).toBe('');
    expect(displaySubtitle(disp({ name: 'Display 2', manufacturer: 'DEL', model: 'U2723QE' }))).toBe('DEL - U2723QE');
    expect(displaySubtitle(disp({ name: 'Display 2', manufacturer: '', model: '' }))).toBe('');
  });
});

describe('DisplayDetailHeader', () => {
  it('shows the name once with no chips or editor action for a plain display', () => {
    render(<DisplayDetailHeader display={disp({})} onDeviceSelect={vi.fn()} />);
    expect(screen.getAllByText('DELL U2723QE')).toHaveLength(1);
    expect(screen.queryByText('displays.primary')).toBeNull();
    expect(screen.queryByText('displays.panel.active')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the primary chip only for the primary display', () => {
    render(<DisplayDetailHeader display={disp({ isPrimary: true })} onDeviceSelect={vi.fn()} />);
    expect(screen.getByText('displays.primary')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the existing panel editor route for a Nexus panel', () => {
    const onDeviceSelect = vi.fn();
    render(<DisplayDetailHeader display={disp({ assignedPanelDeviceId: 'p1' })} onDeviceSelect={onDeviceSelect} />);
    expect(screen.getByText('displays.panel.active')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'displays.panel.open' }));
    expect(onDeviceSelect).toHaveBeenCalledWith('panel-display:p1');
  });

  it('routes the Y70 to its own editor', () => {
    const onDeviceSelect = vi.fn();
    render(<DisplayDetailHeader display={disp({ isY70: true })} onDeviceSelect={onDeviceSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'displays.panel.open' }));
    expect(onDeviceSelect).toHaveBeenCalledWith('panel-device:y70');
  });

  it('treats a USB device virtual monitor as managed automatically and opens the device panel page', () => {
    const onDeviceSelect = vi.fn();
    render(<DisplayDetailHeader display={disp({ ownedByDevicePanel: true, hostingSupported: false, assignedPanelDeviceId: 'p9' })} onDeviceSelect={onDeviceSelect} />);
    expect(screen.getByText('displays.panel.activeAuto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'displays.panel.open' }));
    expect(onDeviceSelect).toHaveBeenCalledWith('panel-stream:p9');
  });
});
