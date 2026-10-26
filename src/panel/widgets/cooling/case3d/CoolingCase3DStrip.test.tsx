import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FanChannel } from '../../../../api/cooling';
import t1 from '../../../../lib/cooling/__fixtures__/t1-cooling-state.json';
import { CoolingCase3D } from './CoolingCase3D';

const h = vi.hoisted(() => ({
  setup: { record: null as unknown, loaded: true },
  layout: { layout: { directions: {}, bindings: [] as unknown[], tests: [] }, settled: true, failed: false, edit: () => {} },
}));

vi.mock('../../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/i18n')>()),
  useTranslation: () => ({ t: (key: string, params?: Record<string, string | number>) => (params ? `${key}[${Object.values(params).join(',')}]` : key) }),
}));
vi.mock('../../../../hooks/useComponentTemps', () => ({ useComponentTemps: () => ({ cpu: null, gpu: null }) }));
vi.mock('../../../../hooks/usePcSetupRecord', () => ({ usePcSetupRecord: () => h.setup }));
vi.mock('../../../../hooks/useCoolingLayout', () => ({ useCoolingLayout: () => h.layout }));
vi.mock('./coolingCaseRenderer', () => ({
  createCaseRenderer: vi.fn(() => ({ setState: vi.fn(), setTemps: vi.fn(), setAnchors: vi.fn(), resize: vi.fn(), dispose: vi.fn(), flowSupported: true })),
}));

// T1's real state: the Y70 with a top radiator, a vertical card with two fans, and the channels the service listed.
const GPU_SLOTS = ['gpu:fan:0', 'gpu:fan:1'];
const channels = (gpuRpm?: number) => t1.channels.map(c => (gpuRpm !== undefined && c.isGpu ? { ...c, rpm: gpuRpm } : c)) as FanChannel[];

/** The strip exactly as it renders: mode label, net, intake and exhaust text. */
const strip = (gpuBinding: string | null, gpuRpm?: number) => {
  const bindings = [...t1.layout.bindings, ...(gpuBinding ? [{ channelId: gpuBinding, slotKeys: GPU_SLOTS }] : [])];
  h.setup = { record: { rev: 1, setup: { version: 1, case: {}, items: [], resolved: { objects: [], caseLayout: t1.caseLayout } } }, loaded: true };
  h.layout = { ...h.layout, layout: { directions: t1.layout.directions, bindings, tests: [] } };
  const view = render(<CoolingCase3D channels={channels(gpuRpm)} selectedChannelId={null} onSelectChannel={vi.fn()} />);
  const group = screen.getByRole('group', { name: 'cooling.case3d.stats.label' }).textContent;
  view.unmount();
  return { group };
};

beforeEach(() => { h.layout = { ...h.layout, layout: { directions: {}, bindings: [], tests: [] } }; });

describe('the top strip on T1 data', () => {
  it('shows the same mode, net, intake and exhaust whatever drives the GPU fans', () => {
    const idle = strip(null, 0);
    expect(idle.group).toContain('cooling.case3d.stat.intake');
    expect(idle.group).toMatch(/cooling\.case3d\.cfm\[\d+\]/);
    for (const driven of [strip(null, 2500), strip('sim:3000'), strip('sim:500'), strip('none')]) expect(driven.group).toBe(idle.group);
  });
});
