import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FanCard } from './FanCard';
import type { FanChannel } from '../../../../api/cooling';

const channel = (over: Partial<FanChannel> = {}): FanChannel => ({
  id: 'fan1', name: 'Fan 1', dutyPercent: 37, rpm: 900, mode: 'Auto',
  classification: 'Controllable', pinned: true, ...over,
});

// The i18n mock returns keys, so the copy is asserted by key. controlled:false drops the mode dropdown, so the standalone pin glyph renders.
function renderCard(ch: FanChannel) {
  render(
    <FanCard
      channel={ch} state={undefined} curves={[]}
      onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={vi.fn()}
      onTogglePin={() => {}} onSetRole={() => {}}
    />,
  );
}

const hoverPin = (name: string) => {
  fireEvent.focus(screen.getByRole('img', { name }));
  return screen.getByRole('tooltip');
};

describe('FanCard pin tooltip', () => {
  it('explains a GPU fan pin as a default', () => {
    renderCard(channel({ isGpu: true, controlled: false }));
    expect(hoverPin('cooling.pin.tipGpu')).toHaveTextContent('cooling.pin.tipGpu');
  });

  it('explains a pump pin', () => {
    renderCard(channel({ kind: 'Pump', controlled: false }));
    expect(hoverPin('cooling.pin.tipPump')).toBeInTheDocument();
  });

  it('explains an AIO channel pin', () => {
    renderCard(channel({ isAio: true, controlled: false }));
    expect(hoverPin('cooling.pin.tipAio')).toBeInTheDocument();
  });

  it('uses the plain copy for a user pin', () => {
    renderCard(channel({ controlled: false }));
    expect(hoverPin('cooling.pin.tip')).toBeInTheDocument();
  });

  it('shows the tooltip on the pin inside the mode dropdown', () => {
    renderCard(channel({ isGpu: true }));
    const pinIcon = document.querySelector('[class*="fanPinTip"]') as HTMLElement;
    fireEvent.focus(pinIcon);
    expect(screen.getByRole('tooltip')).toHaveTextContent('cooling.pin.tipGpu');
  });
});

describe('FanCard pin menu rows', () => {
  it('carry a description line under Pin and Unpin', () => {
    renderCard(channel({ controlled: true }));
    fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));
    expect(screen.getByText('cooling.pin.unpin').closest('button')).toHaveTextContent('cooling.pin.unpinDesc');
  });
});
