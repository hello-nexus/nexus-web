import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FanCard } from './FanCard';
import type { FanChannel } from '../../../../api/cooling';

const channel = (over: Partial<FanChannel> = {}): FanChannel => ({
  id: 'fan1', name: 'Fan 1', dutyPercent: 37, rpm: 900, mode: 'Auto',
  classification: 'Controllable', pinned: true, ...over,
});

// The i18n mock returns keys, so the copy is asserted by key. controlled:false drops the mode dropdown, so the standalone pin glyph renders.
function renderCard(ch: FanChannel, onTogglePin = vi.fn()) {
  render(
    <FanCard
      channel={ch} state={undefined} curves={[]}
      onSetMode={() => {}} onCreateCurve={() => {}} onRename={() => {}} onSpeedChange={vi.fn()}
      onTogglePin={onTogglePin} onSetRole={() => {}}
    />,
  );
}

const pinBtn = () => screen.getByRole('button', { name: 'cooling.pin.unpin' });
const hoverPin = () => {
  fireEvent.focus(pinBtn());
  return screen.getByRole('tooltip');
};

describe('FanCard pin tooltip', () => {
  it('explains a GPU fan pin as a default', () => {
    renderCard(channel({ isGpu: true, controlled: false }));
    expect(hoverPin()).toHaveTextContent('cooling.pin.tipGpu');
  });

  it('explains a pump pin', () => {
    renderCard(channel({ kind: 'Pump', controlled: false }));
    expect(hoverPin()).toHaveTextContent('cooling.pin.tipPump');
  });

  it('explains an AIO channel pin', () => {
    renderCard(channel({ isAio: true, controlled: false }));
    expect(hoverPin()).toHaveTextContent('cooling.pin.tipAio');
  });

  it('uses the plain copy for a user pin', () => {
    renderCard(channel({ controlled: false }));
    expect(hoverPin()).toHaveTextContent('cooling.pin.tip');
  });

  it('shows the tooltip on the pin inside the mode dropdown', () => {
    renderCard(channel({ isGpu: true }));
    fireEvent.focus(pinBtn());
    expect(screen.getByRole('tooltip')).toHaveTextContent('cooling.pin.tipGpu');
  });
});

describe('FanCard pin click to unpin', () => {
  it('unpins from the standalone pin', () => {
    const onTogglePin = vi.fn();
    renderCard(channel({ controlled: false }), onTogglePin);
    fireEvent.click(pinBtn());
    expect(onTogglePin).toHaveBeenCalledWith('fan1', false);
  });

  it('unpins a default-pinned fan from the pin in the mode dropdown without opening it', () => {
    const onTogglePin = vi.fn();
    renderCard(channel({ isGpu: true }), onTogglePin);
    fireEvent.click(pinBtn());
    expect(onTogglePin).toHaveBeenCalledWith('fan1', false);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('hands focus to the role picker on a keyboard unpin, since the pin unmounts', () => {
    renderCard(channel({ controlled: false }));
    const pin = pinBtn();
    pin.focus();
    // detail 0 is how a keyboard-activated click reaches the handler.
    fireEvent.click(pin, { detail: 0 });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'cooling.fanRole.picker' }));
  });

  it('leaves focus alone on a mouse unpin', () => {
    renderCard(channel({ controlled: false }));
    fireEvent.click(pinBtn(), { detail: 1 });
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'cooling.fanRole.picker' }));
  });

  it('has no pin button on an unpinned fan', () => {
    renderCard(channel({ pinned: false, controlled: false }));
    expect(screen.queryByRole('button', { name: 'cooling.pin.unpin' })).toBeNull();
  });
});

describe('FanCard pin menu rows', () => {
  it('carry a description line under Pin and Unpin', () => {
    renderCard(channel({ controlled: true }));
    fireEvent.click(screen.getByRole('button', { name: 'cooling.fan.moreActions' }));
    expect(screen.getByText('cooling.pin.unpin').closest('button')).toHaveTextContent('cooling.pin.unpinDesc');
  });
});
