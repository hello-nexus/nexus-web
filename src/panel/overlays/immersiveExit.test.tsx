import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImmersiveExitProvider, useImmersiveExit } from './immersiveExit';

function Probe() {
  const exit = useImmersiveExit();
  return <button type="button" onClick={exit} disabled={!exit}>{exit ? 'can-exit' : 'no-exit'}</button>;
}

describe('useImmersiveExit', () => {
  it('is undefined outside an immersive overlay', () => {
    // The grid tile and the catalog preview mount widgets outside the overlay;
    // they must render no close control rather than a dead button.
    render(<Probe />);
    expect(screen.getByRole('button')).toHaveTextContent('no-exit');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('exposes the provided exit inside the overlay', async () => {
    const exit = vi.fn();
    render(<ImmersiveExitProvider value={exit}><Probe /></ImmersiveExitProvider>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('can-exit');
    btn.click();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
