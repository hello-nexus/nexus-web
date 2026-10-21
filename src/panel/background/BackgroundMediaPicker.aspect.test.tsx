import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundMediaPicker } from './BackgroundMediaPicker';
import type { BackgroundMediaItem } from '../../api/panelBackgroundMedia';

const api = vi.hoisted(() => ({ library: [] as BackgroundMediaItem[] }));

vi.mock('../../api/panelBackgroundMedia', () => ({
  BACKGROUND_MEDIA_MAX_MB: 500,
  isBackgroundMediaTooLarge: () => false,
  isStageTooLargeRefusal: () => false,
  stageBackgroundMedia: vi.fn(),
  commitBackgroundMedia: vi.fn(),
  cancelBackgroundMediaStage: vi.fn(),
  deleteBackgroundMedia: vi.fn(),
  openBackgroundMediaFolder: vi.fn(),
  backgroundMediaStagePreviewUrl: vi.fn(),
  backgroundMediaStageRawUrl: vi.fn(),
  backgroundMediaThumbnailPath: vi.fn(),
}));
vi.mock('../../api/klipy', () => ({ searchKlipy: vi.fn(), klipyThumbUrl: vi.fn(), stageKlipyBackground: vi.fn() }));
vi.mock('../../components/common/Toast/Toast', () => ({ useToastSafe: () => ({ push: vi.fn() }) }));
vi.mock('./useBackgroundMedia', () => ({
  useBackgroundMedia: () => ({ items: api.library, thumbs: {}, refresh: vi.fn(), removeLocal: vi.fn() }),
}));
// jsdom drops the aspect-ratio property, so the cards report the prop they were given instead.
vi.mock('../../components/common/EffectCard/EffectCard', () => ({
  EffectCard: ({ label, thumbAspect, thumbRound }: { label: string; thumbAspect?: number; thumbRound?: boolean }) => (
    <div data-testid="card" data-aspect={String(thumbAspect)} data-round={thumbRound ? 'yes' : 'no'}>{label}</div>
  ),
}));
vi.mock('../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, language: 'en' }) }));

const item = (id: string): BackgroundMediaItem => ({
  id, name: `${id}.jpg`, sourceExt: '.jpg', type: 'static', width: 720, height: 1280, importedAtUnixMs: 1, durationSec: 0, alpha: false,
});

// The tile shape is the panel's display shape, so a square panel crops a portrait photo to a square.
describe('BackgroundMediaPicker tile aspect', () => {
  it.each([
    ['square', 1],
    ['portrait', 720 / 1280],
    ['wide', 1600 / 720],
  ])('draws every media tile at the %s panel aspect', (_name, aspect) => {
    api.library = [item('a'), item('b')];
    const { container } = render(
      <BackgroundMediaPicker deviceId="dev1" activeId={null} deviceAspect={aspect} deviceW={720} deviceH={720} onSelect={vi.fn()} />,
    );
    const { getAllByTestId } = within(container);
    const cards = getAllByTestId('card');
    expect(cards).toHaveLength(2);
    for (const el of cards) expect(Number(el.dataset.aspect)).toBeCloseTo(aspect, 5);
  });

  it.each([
    ['round panel', true, 'yes'],
    ['rectangular panel', false, 'no'],
  ])('draws the tiles %s as expected', (_name, round, expected) => {
    api.library = [item('a')];
    const { container } = render(
      <BackgroundMediaPicker deviceId="dev1" activeId={null} deviceAspect={1} round={round} deviceW={720} deviceH={720} onSelect={vi.fn()} />,
    );
    for (const el of within(container).getAllByTestId('card')) expect(el.dataset.round).toBe(expected);
  });
});
