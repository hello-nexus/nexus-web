import { deleteService, fetchService, postService, putService } from './service';
import type { PanelLayout } from '../panel/types';

export interface DashboardPresetsResponse {
  presets: Array<{ id: string; name: string }>;
  activeId: string | null;
  /** False until the starter set is sent; see seedDashboardPresets. */
  seeded: boolean;
}

const PATH = '/dashboard/presets';
const presetPath = (presetId: string) => `${PATH}/${encodeURIComponent(presetId)}`;

export const fetchDashboardPresets = () =>
  fetchService<DashboardPresetsResponse>(PATH);

/** Stores the starter set once; the service ignores it after the first seed. A null layout is the install default. */
export const seedDashboardPresets = (presets: Array<{ name: string; layout: PanelLayout | null }>) =>
  postService<DashboardPresetsResponse>(`${PATH}/seed`, { presets });

export const createDashboardPreset = (name: string) =>
  postService<DashboardPresetsResponse>(PATH, { name });

export const renameDashboardPreset = (presetId: string, name: string) =>
  putService<DashboardPresetsResponse>(presetPath(presetId), { name });

export const deleteDashboardPreset = (presetId: string) =>
  deleteService<DashboardPresetsResponse>(presetPath(presetId));

export const activateDashboardPreset = (presetId: string) =>
  postService<DashboardPresetsResponse>(`${presetPath(presetId)}/activate`, {});
