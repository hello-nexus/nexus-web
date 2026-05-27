// HYTE CNVS device endpoints. Two firmware-side toggles that control
// what the CNVS does without Nexus driving it: the boot-time connection
// animation and whether LEDs stay lit when the PC is powered off. Both
// are persisted by the service to settings.json.

import { fetchService, postService } from './service';

export interface CnvsSettings {
  playAnimation: boolean;
  playWhenPCOff: boolean;
}

interface CnvsSettingsResponse extends CnvsSettings {
  error?: boolean;
  msg?: string;
}

export async function getCnvsSettings(): Promise<CnvsSettings | null> {
  const r = await fetchService<CnvsSettingsResponse>('/devices/cnvs');
  if (!r) return null;
  return { playAnimation: !!r.playAnimation, playWhenPCOff: !!r.playWhenPCOff };
}

export function setCnvsSettings(body: CnvsSettings): Promise<unknown | null> {
  return postService('/devices/cnvs', body);
}
