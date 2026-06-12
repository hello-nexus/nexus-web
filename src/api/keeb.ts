import { fetchService, postService } from './service';

// ────────── Wire types (mirror nexus-service KeebDtos.cs) ──────────

export type KeebLayout = 'ANSI' | 'ISO';
export type KeebLayer = 0 | 1 | 2 | 3;
export const KEEB_LAYERS: readonly KeebLayer[] = [0, 1, 2, 3] as const;

export type KeyAssignmentMode =
  | 'StandardKey'
  | 'MouseKey'
  | 'MediaKey'
  | 'SystemMediaKey'
  | 'WebMediaKey'
  | 'SystemKey'
  | 'MacroKey'
  | 'LayerKey'
  | 'ProfileKey'
  | 'RGBKey'
  | 'SoftwareKey';

export interface KeebKey {
  mode: KeyAssignmentMode | '';
  function: string;
  input: number | null;
}

export interface KeyboardState {
  isConnected: boolean;
  profile: number;
  layout: KeebLayout;
  layer: KeebLayer;
  keys: KeebKey[][];
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface KeebSettings {
  shiftKeyDisabled: boolean;
  windowsKeyDisabled: boolean;
  altF4Disabled: boolean;
  altTabDisabled: boolean;
  animationMode: string;
  speed: string;
  direction: string;
  brightness: number;
  keyIndicator: boolean;
  keyReactive: boolean;
  keyReactiveMask: boolean;
  keyReactiveMode: string;
  keyReactiveColor: RGBA;
}

export interface SetFirmwareLightingBody {
  animationMode: string;
  speed: string;
  direction: string;
  brightness: number;
  keyIndicator: boolean;
}

export interface SetPassiveLightingBody {
  keyReactive: boolean;
  keyReactiveMask: boolean;
  keyReactiveMode: string;
  keyReactiveColor: RGBA;
}

export interface SetGameModeBody {
  altF4: boolean;
  altTab: boolean;
  shiftTab: boolean;
  windowsKey: boolean;
}

export interface SetLayerKeyBody {
  x: number;
  y: number;
  func: string;
  mode: KeyAssignmentMode;
  input?: number | null;
}

export interface RotaryAppOverride {
  targetId: string;
  left: string;
  right: string;
}

export interface SetRotaryWheelsBody {
  left: string;
  right: string;
  apps: RotaryAppOverride[];
}

export interface MacroKey {
  key: string;
  duration: number;
  type: 'Make' | 'Break' | 'KeyDown' | 'KeyUp';
  category: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface KeebMacro {
  index: number;
  keys: MacroKey[];
}

// nexus-service's ApiResponse envelope: Ok() serializes { error: false,
// msg: "Ok" }; Fail() sets error: true.
interface ApiResponseWrapper {
  error?: boolean;
  msg?: string;
}

interface GetMacroResponse extends ApiResponseWrapper {
  macro: KeebMacro;
}

interface GetRotaryFunctionsResponse extends ApiResponseWrapper {
  functions: string[];
}

// ────────── Wrappers ──────────

export async function getKeebState(layer: KeebLayer = 0): Promise<KeyboardState | null> {
  return await fetchService<KeyboardState>(`/keeb/state?layer=${layer}`);
}

export async function getKeebLayer(layer: KeebLayer): Promise<KeyboardState | null> {
  return await fetchService<KeyboardState>(`/keeb/layer/${layer}`);
}

export async function setKeebLayerKey(layer: KeebLayer, body: SetLayerKeyBody): Promise<KeyboardState | null> {
  return await postService<KeyboardState>(`/keeb/layer/${layer}/key`, body);
}

export async function resetKeebLayer(layer: KeebLayer): Promise<KeyboardState | null> {
  return await postService<KeyboardState>(`/keeb/layer/${layer}/reset`, {});
}

export async function getKeebSettings(): Promise<KeebSettings | null> {
  return await fetchService<KeebSettings>('/keeb/settings');
}

// A write is acked only by a 2xx whose envelope doesn't carry error:true -
// every current failure is a non-2xx (null here), but a future 200 +
// ApiResponse.Fail must not read as an ack.
function acked(r: ApiResponseWrapper | null): boolean {
  return r !== null && r.error !== true;
}

export async function setKeebFirmwareLighting(body: SetFirmwareLightingBody): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>('/keeb/firmware/lighting', body));
}

export async function setKeebPassiveLighting(body: SetPassiveLightingBody): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>('/keeb/passive-lighting', body));
}

export async function setKeebGameMode(body: SetGameModeBody): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>('/keeb/game-mode', body));
}

export async function getKeebRotaryFunctions(): Promise<string[]> {
  const r = await fetchService<GetRotaryFunctionsResponse>('/keeb/rotary/functions');
  return r?.functions ?? [];
}

export async function setKeebRotary(body: SetRotaryWheelsBody): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>('/keeb/rotary', body));
}

export async function setKeebRotarySensitivity(sensitivity: string): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>('/keeb/rotary/sensitivity', { sensitivity }));
}

export async function getKeebMacro(index: number): Promise<KeebMacro | null> {
  const r = await fetchService<GetMacroResponse>(`/keeb/macro/${index}`);
  return r?.macro ?? null;
}

export async function setKeebMacro(index: number, keys: MacroKey[]): Promise<KeebMacro | null> {
  const r = await postService<GetMacroResponse>(`/keeb/macro/${index}`, { keys });
  return r?.macro ?? null;
}
