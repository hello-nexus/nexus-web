import { fetchService, postService, postServiceForm } from './service';

export interface TryxState {
  serial: string;
  adbSerial: string;
  portName: string;
  modelName: string;
  productId: number;
  screenEnabled: boolean;
  brightness: number;
  currentMedia: string | null;
  currentMediaIsCustom: boolean;
}

export interface TryxStatus {
  connected: boolean;
  state: TryxState | null;
}

export interface TryxPreset { id: string; name: string; }
export interface TryxMediaUploadResult { error: boolean; msg: string; media: string; }

export const getTryxStatus = () => fetchService<TryxStatus>('/tryx/status');
export const postTryxBrightness = (value: number) => postService<{ error: boolean }>('/tryx/brightness', { value });
export const postTryxScreen = (enable: boolean) => postService<{ error: boolean }>('/tryx/screen', { enable });
export const getTryxPresets = () => fetchService<{ presets: TryxPreset[] }>('/tryx/presets');
export const postTryxPreset = (id: string) => postService<{ error: boolean }>('/tryx/preset', { id });
export const postTryxFan = (args: { mode: 'smart' | 'fixed'; curve?: number[][]; fixed?: number }) =>
  postService<{ error: boolean }>('/tryx/fan', args);
export const getTryxMedia = () => fetchService<{ media: string[] }>('/tryx/media');
export const postTryxMediaDelete = (name: string) => postService<{ error: boolean }>('/tryx/media/delete', { name });
export async function postTryxMediaUpload(
  file: File,
  crop: string,
): Promise<TryxMediaUploadResult | null> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', crop);
  form.append('targetWidth', '858');
  form.append('targetHeight', '428');
  return postServiceForm<TryxMediaUploadResult>('/tryx/media', form);
}
