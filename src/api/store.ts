// Store catalog client. Every call goes to the LOCAL service, which proxies the
// cloud catalog: the dashboard is served under connect-src 'self', so it cannot
// reach the cloud API itself.

import { fetchService, postService } from './service';

export interface StoreVersion {
  version: string;
  sha256: string;
  size: number;
  minNexusVersion: string;
  hasWidget: boolean;
  hasPage: boolean;
  requiresTouch: boolean;
  sizes: string[];
  surfaces: string[];
  releasedAt: string;
}

export interface StoreRating {
  average: number;
  count: number;
}

export interface StoreApp {
  id: string;
  name: string;
  tagline: string;
  publisher: string;
  category: string;
  iconUrl: string | null;
  rating: StoreRating;
  latest: StoreVersion | null;
}

export interface StoreAppDetail extends StoreApp {
  description: string;
  screenshots: string[];
  versions: Array<{ version: string; releasedAt: string; minNexusVersion: string }>;
}

export interface StoreInstallResult {
  appId: string;
  version: string;
  ok: boolean;
  reason?: string;
}

/** The catalog answers per client, so it never offers a release this build cannot run. */
function clientQuery(nexusVersion?: string): string {
  return nexusVersion ? `?nexusVersion=${encodeURIComponent(nexusVersion)}` : '';
}

export async function fetchStoreApps(nexusVersion?: string): Promise<StoreApp[] | null> {
  const res = await fetchService<{ apps: StoreApp[] }>(`/apps-api/store/apps${clientQuery(nexusVersion)}`);
  return res?.apps ?? null;
}

export async function fetchStoreApp(appId: string, nexusVersion?: string): Promise<StoreAppDetail | null> {
  return fetchService<StoreAppDetail>(`/apps-api/store/apps/${appId}${clientQuery(nexusVersion)}`);
}

/**
 * The hash comes from the catalog and is passed through untouched: the service
 * verifies the download against it and composes the URL itself, so a page can
 * neither redirect the download nor weaken its verification.
 */
export async function installStoreApp(app: { id: string; latest: StoreVersion }): Promise<StoreInstallResult | null> {
  return postService<StoreInstallResult>('/apps-api/store/install', {
    appId: app.id,
    version: app.latest.version,
    sha256: app.latest.sha256,
    size: app.latest.size,
  });
}
