// Prop forwarding is invisible to the rest of the suite - a widget that gates
// on touch renders fine either way in a test that does not inspect the props -
// which is how the original monitor-gating bug shipped. Pin it here.
// The probe reports through the DOM rather than a captured variable, since
// reassigning outer state during render is a lint error (and a real hazard).
import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { makeWidgetTouchView } from './WidgetTouchView';
import type { PanelWidget } from '../../types';
import type { WidgetProps } from '../types';

const widget = { id: 'w', type: 'clock', size: '2x2', col: 0, row: 0, config: {} } as PanelWidget;

function Probe({ surface, deviceTouch, widget: w }: WidgetProps) {
  return (
    <div
      data-testid="probe"
      data-surface={surface ?? 'undefined'}
      data-device-touch={String(deviceTouch)}
      data-size={w.size}
    />
  );
}

const Wrapped = makeWidgetTouchView(Probe);

function probe() {
  return screen.getByTestId('probe');
}

describe('makeWidgetTouchView', () => {
  it('forwards surface and deviceTouch to the wrapped widget', () => {
    render(<Wrapped widget={widget} surface="monitor" deviceTouch immersiveGrid={{ columns: 14, rows: 4 }} />);
    expect(probe().dataset.surface).toBe('monitor');
    expect(probe().dataset.deviceTouch).toBe('true');
    cleanup();
  });

  it('forwards a false deviceTouch rather than dropping it', () => {
    // Dropping the prop and passing false are indistinguishable at the render
    // site but not to surfaceSupportsTouch, which treats undefined as non-touch
    // only for monitors - so the distinction has to survive.
    render(<Wrapped widget={widget} surface="monitor" deviceTouch={false} immersiveGrid={{ columns: 14, rows: 4 }} />);
    expect(probe().dataset.deviceTouch).toBe('false');
    cleanup();
  });

  it('renders the widget at 4x4 for the immersive page', () => {
    render(<Wrapped widget={widget} surface="y70" immersiveGrid={{ columns: 4, rows: 8 }} />);
    expect(probe().dataset.size).toBe('4x4');
    cleanup();
  });
});
