import type { SceneLayout } from '../../../../lib/scene/pcScene';
import type { CaselessParts } from '../caselessParts';
import layouts from './layouts.json';

export interface CaselessFixture {
  parts: CaselessParts;
  /** A layout resolved with no case by Build's own layout code, kept whole; the widget keeps only the detected parts. */
  layout: SceneLayout;
}

export const CASELESS_FIXTURE_IDS = ['aio', 'air', 'few'] as const;
export type CaselessFixtureId = (typeof CASELESS_FIXTURE_IDS)[number];

const layoutOf = (id: CaselessFixtureId): SceneLayout => layouts[id] as unknown as SceneLayout;

export const CASELESS_FIXTURES: Record<CaselessFixtureId, CaselessFixture> = {
  aio: {
    parts: { cpu: 'Ryzen 7 7800X3D', gpu: 'RTX 4080', ram: '32 GB DDR5', board: 'B650', cooler: { kind: 'aio', radiatorMm: 360 } },
    layout: layoutOf('aio'),
  },
  air: {
    parts: { cpu: 'Ryzen 5 7600', gpu: 'RTX 4070', ram: '32 GB DDR5', board: 'B650', cooler: { kind: 'air' } },
    layout: layoutOf('air'),
  },
  few: {
    parts: { cpu: 'Ryzen 5 7600', ram: '16 GB DDR5', board: 'B650' },
    layout: layoutOf('few'),
  },
};
