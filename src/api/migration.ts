import { fetchService, postService } from './service';

export interface Nexus2StatusResponse {
  detected: boolean;
  importAvailable: boolean;
  deviceEligible: boolean;
  version?: string | null;
  autostartTaskPresent: boolean;
  running: boolean;
  pending: boolean;
}

export interface Nexus2DismissResponse {
  dismissed: boolean;
}

// nexus-service's ApiResponse envelope: Ok() serializes { error: false, msg }, Fail() { error: true, msg }.
export interface Nexus2ActionResponse {
  error: boolean;
  msg: string;
}

export type Nexus2CategoryId =
  | 'appearance'
  | 'y70Layout'
  | 'q60Face'
  | 'wallpapers'
  | 'gallerySources'
  | 'rotation'
  | 'language';

interface Nexus2PreviewCategoryBase {
  available: boolean;
}

export interface Nexus2AppearanceCategory extends Nexus2PreviewCategoryBase {
  id: 'appearance';
  accentColor: string | null;
  background: string | null;
}

export interface Nexus2Y70LayoutCategory extends Nexus2PreviewCategoryBase {
  id: 'y70Layout';
  pages: number;
  widgets: number;
  mappedWidgets: number;
  droppedTypes: string[];
}

export interface Nexus2Q60FaceCategory extends Nexus2PreviewCategoryBase {
  id: 'q60Face';
  face: string | null;
  stashedFaces: number;
}

export interface Nexus2WallpapersCategory extends Nexus2PreviewCategoryBase {
  id: 'wallpapers';
  count: number;
}

export interface Nexus2GallerySourcesCategory extends Nexus2PreviewCategoryBase {
  id: 'gallerySources';
  count: number;
  missing: number;
}

export interface Nexus2RotationCategory extends Nexus2PreviewCategoryBase {
  id: 'rotation';
  value: string | null;
}

export interface Nexus2LanguageCategory extends Nexus2PreviewCategoryBase {
  id: 'language';
  value: string | null;
}

export type Nexus2PreviewCategory =
  | Nexus2AppearanceCategory
  | Nexus2Y70LayoutCategory
  | Nexus2Q60FaceCategory
  | Nexus2WallpapersCategory
  | Nexus2GallerySourcesCategory
  | Nexus2RotationCategory
  | Nexus2LanguageCategory;

export interface Nexus2PreviewResponse {
  available: boolean;
  profileName: string | null;
  categories: Nexus2PreviewCategory[];
}

export type Nexus2ApplyStatus = 'applied' | 'skipped' | 'failed' | 'needsConfirm';

export interface Nexus2ApplyResult {
  id: string;
  status: Nexus2ApplyStatus;
  detail: string | null;
}

export interface Nexus2ApplyResponse {
  results: Nexus2ApplyResult[];
}

export async function fetchNexus2Status() {
  return fetchService<Nexus2StatusResponse>('/migration/nexus2');
}

export async function dismissNexus2Welcome() {
  return postService<Nexus2DismissResponse>('/migration/nexus2/dismiss', {});
}

export async function disableNexus2Autostart() {
  return postService<Nexus2ActionResponse>('/migration/nexus2/disable-autostart', {});
}

export async function closeNexus2App() {
  return postService<Nexus2ActionResponse>('/migration/nexus2/close-app', {});
}

export async function previewNexus2Import() {
  return postService<Nexus2PreviewResponse>('/migration/nexus2/preview', {});
}

export async function applyNexus2Import(categories: string[], replaceCustomizedLayout: boolean) {
  return postService<Nexus2ApplyResponse>('/migration/nexus2/apply', { categories, replaceCustomizedLayout });
}
