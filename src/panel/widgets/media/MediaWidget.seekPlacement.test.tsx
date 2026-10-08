// The stacked touch tiles seat the seek bar on the transport row so it reads as
// part of the controls; every other layout keeps it under the track text.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MediaWidget } from './MediaWidget';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { PanelWidget } from '../../types';

function barParent(size: PanelWidget['size'], surface: 'y70' | 'q60') {
  const widget: PanelWidget = { id: 'media-1', type: 'media', size, col: 0, row: 0, config: {} };
  const { container } = render(
    <PanelPreviewProvider value={true}>
      <MediaWidget widget={widget} surface={surface} />
    </PanelPreviewProvider>,
  );
  const bar = container.querySelector('[class*="progressTrack"]');
  expect(bar).not.toBeNull();
  if (bar?.closest('[class*="transport"]')) return 'transport';
  if (bar?.closest('[class*="metadata"]')) return 'metadata';
  return 'other';
}

describe('MediaWidget seek bar placement', () => {
  it('heads the transport on a 4x4 touch tile', () => {
    expect(barParent('4x4', 'y70')).toBe('transport');
  });

  it('stays under the text on a 4x2 touch tile', () => {
    expect(barParent('4x2', 'y70')).toBe('metadata');
  });

  it('stays under the text on a display-only stacked tile', () => {
    expect(barParent('4x4', 'q60')).toBe('metadata');
  });
});
