import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FanCard } from './FanCard';
import type { FanChannel } from '../../../../api/cooling';

vi.mock('../../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/i18n')>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}));

// A duty offset is the one piece of cooling state a user never asked for
// directly - the FanControl import creates it - so the card has to say it is
// there and offer a way out.

const CHANNEL: FanChannel = {
  id: 'fan1', name: 'CPU Fan', dutyPercent: 40, rpm: 900, mode: 'Manual', kind: 'Fan',
};

function renderCard(channel: FanChannel, onClearOffset?: (id: string) => void) {
  return render(
    <FanCard
      channel={channel}
      state={{ softwareControl: true, curveId: null }}
      curves={[]}
      calibrating={false}
      onSetMode={() => {}}
      onCreateCurve={() => {}}
      onRename={() => {}}
      onSpeedChange={() => {}}
      onToggleLock={() => {}}
      onSetRole={() => {}}
      onClearOffset={onClearOffset}
    />,
  );
}

describe('FanCard duty offset', () => {
  it('says so when a fan carries one', () => {
    renderCard({ ...CHANNEL, offset: 5 });
    expect(screen.getByText('cooling.fan.offsetBadge:+5')).toBeInTheDocument();
  });

  it('keeps the sign on a negative offset', () => {
    renderCard({ ...CHANNEL, offset: -10 });
    expect(screen.getByText('cooling.fan.offsetBadge:-10')).toBeInTheDocument();
  });

  it('shows nothing for a fan without one', () => {
    renderCard({ ...CHANNEL, offset: 0 });
    expect(screen.queryByText(/offsetBadge/)).not.toBeInTheDocument();
  });

  it('offers to clear it from the mode menu', () => {
    const onClear = vi.fn();
    renderCard({ ...CHANNEL, offset: 5 }, onClear);
    fireEvent.click(screen.getByRole('button', { name: /cooling.card/ }));
    fireEvent.click(screen.getByRole('option', { name: 'cooling.card.clearOffset' }));
    expect(onClear).toHaveBeenCalledWith('fan1');
  });

  it('does not offer to clear one that is not there', () => {
    renderCard({ ...CHANNEL, offset: 0 }, vi.fn());
    fireEvent.click(screen.getByRole('button', { name: /cooling.card/ }));
    expect(screen.queryByRole('option', { name: 'cooling.card.clearOffset' })).not.toBeInTheDocument();
  });
});
