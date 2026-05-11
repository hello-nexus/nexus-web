import { fetchService, postService, patchService, deleteService } from './service';
import type { PanelConfigValue } from '../panel/types';

export interface OverlayWidgetDto {
  id: string;
  type: string;
  size: string;
  monitor: number;
  col: number;
  row: number;
  config?: Record<string, PanelConfigValue>;
}

export interface OverlayWidgetCreateBody {
  type: string;
  size?: string;
  monitor?: number;
  col?: number;
  row?: number;
  config?: Record<string, PanelConfigValue>;
}

export interface OverlayWidgetPatch {
  size?: string;
  monitor?: number;
  col?: number;
  row?: number;
  config?: Record<string, PanelConfigValue>;
}

export async function listOverlayWidgets(): Promise<OverlayWidgetDto[]> {
  const result = await fetchService<OverlayWidgetDto[]>('/overlay/widgets');
  return Array.isArray(result) ? result : [];
}

export async function createOverlayWidget(
  body: OverlayWidgetCreateBody,
): Promise<OverlayWidgetDto | null> {
  return postService<OverlayWidgetDto>('/overlay/widgets', body);
}

export async function patchOverlayWidget(
  id: string,
  body: OverlayWidgetPatch,
): Promise<OverlayWidgetDto | null> {
  return patchService<OverlayWidgetDto>(`/overlay/widgets/${id}`, body);
}

export async function deleteOverlayWidget(
  id: string,
): Promise<boolean> {
  const result = await deleteService<{ error: boolean }>(`/overlay/widgets/${id}`);
  return result !== null && !result.error;
}
