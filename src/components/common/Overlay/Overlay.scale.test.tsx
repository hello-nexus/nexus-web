import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Overlay } from './Overlay';
import { OverlayScaleContext } from './overlayScale';

const surfaceOf = () => screen.getByText('body').parentElement as HTMLElement;

describe('Overlay panel scale', () => {
  it('leaves the surface unzoomed by default (dashboard look)', () => {
    render(<Overlay open onClose={() => {}} variant="alert"><p>body</p></Overlay>);
    expect(surfaceOf().style.zoom).toBe('');
  });

  it('zooms centered dialogs by the host panel chrome scale', () => {
    render(
      <OverlayScaleContext.Provider value={1.7}>
        <Overlay open onClose={() => {}} variant="alert"><p>body</p></Overlay>
      </OverlayScaleContext.Provider>,
    );
    expect(surfaceOf().style.zoom).toBe('1.7');
  });

  it('caps a zoomed surface to the viewport, dividing the limits by the scale', () => {
    render(
      <OverlayScaleContext.Provider value={2}>
        <Overlay open onClose={() => {}} variant="alert"><p>body</p></Overlay>
      </OverlayScaleContext.Provider>,
    );
    const style = surfaceOf().style;
    expect(style.maxHeight).toContain('100dvh');
    // jsdom normalizes the division by 2 to a 0.5 factor.
    expect(style.maxHeight).toContain('0.5');
    expect(style.maxWidth).toContain('0.5');
    expect(style.overflowY).toBe('auto');
  });

  it('never zooms a sheet, which its owner places itself', () => {
    render(
      <OverlayScaleContext.Provider value={1.7}>
        <Overlay open onClose={() => {}} variant="sheet"><p>body</p></Overlay>
      </OverlayScaleContext.Provider>,
    );
    expect(surfaceOf().style.zoom).toBe('');
  });
});
