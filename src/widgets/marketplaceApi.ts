// Marketplace HTTP client for the dashboard. Calls nexus-service's
// /apps-api/available + /apps-api/install + /apps-api/uninstall.

import { fetchService, postService } from '../api/service';
import type { AppCatalogResponse, AppCatalogEntry } from './types';

export interface InstallResult {
  installed: boolean;
  id: string;
  error?: string;
}

export async function listAvailableApps(): Promise<AppCatalogEntry[]> {
  const r = await fetchService<AppCatalogResponse>('/apps-api/available');
  return r?.entries ?? [];
}

export async function installApp(id: string): Promise<InstallResult | null> {
  return postService<InstallResult>('/apps-api/install', { id });
}

export async function uninstallApp(id: string): Promise<InstallResult | null> {
  return postService<InstallResult>('/apps-api/uninstall', { id });
}
