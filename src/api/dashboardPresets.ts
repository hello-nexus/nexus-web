import { deleteService, fetchService, postService, putService } from './service';

export interface DashboardPresetsResponse {
  presets: Array<{ id: string; name: string }>;
  activeId: string | null;
}

const PATH = '/dashboard/presets';
const presetPath = (presetId: string) => `${PATH}/${encodeURIComponent(presetId)}`;

export const fetchDashboardPresets = () =>
  fetchService<DashboardPresetsResponse>(PATH);

export const createDashboardPreset = (name: string) =>
  postService<DashboardPresetsResponse>(PATH, { name });

export const renameDashboardPreset = (presetId: string, name: string) =>
  putService<DashboardPresetsResponse>(presetPath(presetId), { name });

export const deleteDashboardPreset = (presetId: string) =>
  deleteService<DashboardPresetsResponse>(presetPath(presetId));

export const activateDashboardPreset = (presetId: string) =>
  postService<DashboardPresetsResponse>(`${presetPath(presetId)}/activate`, {});
