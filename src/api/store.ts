// Store catalog client. Every call goes to the LOCAL service, which proxies the
// cloud catalog. Not because the catalog fetch is blocked - connect-src lists
// api.hellonexus.com - but because img-src does not list assets.hellonexus.com,
// so the listing has to come back with its media rewritten onto this origin.

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
  /** App Store-style subtitle; empty for an app that has not set one, which is why cards fall back to the description. */
  tagline: string;
  /** Optional on the wire: a catalog older than the field omits it entirely, so a client must not assume a string. */
  description?: string;
  publisher: string;
  category: string;
  iconUrl: string | null;
  /** Launch day, ISO. Absent or null means available now; a future date means the service refuses the install until then. */
  releaseDate?: string | null;
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
  /** 'sign_in_required' is the account gate, 'not_yet_released' the launch-day one; the rest are download/verify failures. */
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

/** One row of Manage purchases: the cloud's ownership record plus what this machine has on disk. */
export interface StorePurchase {
  appId: string;
  name: string;
  tagline: string;
  description: string;
  iconUrl: string | null;
  /** When the account first got the app. Null for an app installed here with no purchase record. */
  acquiredAt: string | null;
  priceCents: number;
  /** Null for a local-only row: the store knows nothing about the app either way. */
  listed: boolean | null;
  installedVersion: string | null;
  installedAt: string | null;
  sizeBytes: number | null;
}

export interface StoreLibrary {
  signedIn: boolean;
  /** The account's cloud library could not be read; only local installs are listed. */
  offline: boolean;
  purchases: StorePurchase[];
}

export async function fetchStoreLibrary(): Promise<StoreLibrary | null> {
  return fetchService<StoreLibrary>('/apps-api/store/library');
}
