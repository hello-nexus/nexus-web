// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(),
  putService: vi.fn(),
  deleteService: vi.fn(),
}));

import { postService } from './service';
import { createLayoutPreset } from './lighting';
import { createCoolingPreset } from './cooling';
import { createDashboardPreset } from './dashboardPresets';
import { createPanelPreset } from './panel';

beforeEach(() => vi.clearAllMocks());

describe('preset create bodies', () => {
  it('lighting sends fresh only for New preset', async () => {
    await createLayoutPreset('A', true);
    expect(postService).toHaveBeenLastCalledWith('/devices/lighting-devices/layout-presets', { name: 'A', fresh: true });
    await createLayoutPreset('A', false);
    expect(postService).toHaveBeenLastCalledWith('/devices/lighting-devices/layout-presets', { name: 'A' });
  });

  it('cooling sends fresh only for New preset', async () => {
    await createCoolingPreset('A', true);
    expect(postService).toHaveBeenLastCalledWith('/cooling/presets', { name: 'A', fresh: true });
    await createCoolingPreset('A', false);
    expect(postService).toHaveBeenLastCalledWith('/cooling/presets', { name: 'A' });
  });

  it('dashboard sends fresh only for New preset', async () => {
    await createDashboardPreset('A', true);
    expect(postService).toHaveBeenLastCalledWith('/dashboard/presets', { name: 'A', fresh: true });
    await createDashboardPreset('A', false);
    expect(postService).toHaveBeenLastCalledWith('/dashboard/presets', { name: 'A' });
  });

  it('device panel sends fresh only for New preset', async () => {
    await createPanelPreset('q60', 'A', true);
    expect(postService).toHaveBeenLastCalledWith('/panel/devices/q60/presets', { name: 'A', fresh: true });
    await createPanelPreset('q60', 'A', false);
    expect(postService).toHaveBeenLastCalledWith('/panel/devices/q60/presets', { name: 'A' });
  });
});
