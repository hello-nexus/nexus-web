// Marketplace HTTP client for the dashboard. Calls qos-service's
// /widgets-api/available + /widgets-api/install + /widgets-api/uninstall.

import { fetchService, postService } from '../api/service';
import type { WidgetCatalogResponse, WidgetCatalogEntry } from './types';

export interface InstallResult {
  installed: boolean;
  id: string;
  error?: string;
}

export async function listAvailableWidgets(): Promise<WidgetCatalogEntry[]> {
  const r = await fetchService<WidgetCatalogResponse>('/widgets-api/available');
  return r?.entries ?? [];
}

export async function installWidget(id: string): Promise<InstallResult | null> {
  return postService<InstallResult>('/widgets-api/install', { id });
}

export async function uninstallWidget(id: string): Promise<InstallResult | null> {
  return postService<InstallResult>('/widgets-api/uninstall', { id });
}
