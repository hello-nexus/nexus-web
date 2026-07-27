// A 'monitor' surface is interactive per-DEVICE, so MediaWidget must gate its
// controls on surfaceSupportsTouch(surface, deviceTouch). Passing only the
// surface reads every monitor - including a touch-digitizer Xeneon Edge - as
// non-interactive and drops the transport row and volume rail.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaWidget } from './MediaWidget';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { PanelWidget } from '../../types';

const widget: PanelWidget = {
  id: 'media-1',
  type: 'media',
  size: '4x2',
  col: 0,
  row: 0,
  config: {},
};

function renderAt(surface: 'monitor' | 'q60' | 'y70', deviceTouch?: boolean) {
  return render(
    <PanelPreviewProvider value={true}>
      <MediaWidget widget={widget} surface={surface} deviceTouch={deviceTouch} />
    </PanelPreviewProvider>,
  );
}

// t() is uninitialised under vitest and returns the raw key.
const NEXT = 'panel.media.next';
const VOLUME = 'panel.media.volume';

describe('MediaWidget control gating by surface', () => {
  it('renders transport + volume on a touch-capable monitor (Xeneon Edge)', () => {
    renderAt('monitor', true);
    expect(screen.getByLabelText(NEXT)).toBeTruthy();
    expect(screen.getByLabelText(VOLUME)).toBeTruthy();
  });

  it('hides transport + volume on a monitor with no digitizer', () => {
    renderAt('monitor', false);
    expect(screen.queryByLabelText(NEXT)).toBeNull();
    expect(screen.queryByLabelText(VOLUME)).toBeNull();
  });

  it('hides transport + volume when deviceTouch is unknown', () => {
    renderAt('monitor');
    expect(screen.queryByLabelText(NEXT)).toBeNull();
    expect(screen.queryByLabelText(VOLUME)).toBeNull();
  });

  it('keeps q60 display-only and y70 interactive regardless of deviceTouch', () => {
    const q60 = renderAt('q60', true);
    expect(screen.queryByLabelText(NEXT)).toBeNull();
    q60.unmount();

    renderAt('y70', false);
    expect(screen.getByLabelText(NEXT)).toBeTruthy();
  });
});
