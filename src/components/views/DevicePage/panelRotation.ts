import type { PanelSurface } from '../../../panel/types';

export type PanelRotation = 0 | 90 | 180 | 270;

const ROTATIONS: readonly PanelRotation[] = [0, 90, 180, 270];

// Y70 locale key suffix per clockwise quarter turn, for rectangular glass.
const RECT_ORIENTATION_KEY: Record<PanelRotation, string> = {
  0: 'Landscape',
  90: 'Portrait',
  180: 'LandscapeFlipped',
  270: 'PortraitFlipped',
};

export function normalizeRotation(value: number | null | undefined): PanelRotation | undefined {
  return ROTATIONS.find(r => r === value);
}

// Older services only send flip180 and portrait, so they stand in until rotation arrives.
export function resolveRecordRotation(record: { rotation?: number | null; flip180?: boolean | null; portrait?: boolean | null } | undefined): PanelRotation {
  const rotation = normalizeRotation(record?.rotation);
  if (rotation !== undefined) return rotation;
  if (record?.portrait) return record.flip180 ? 270 : 90;
  return record?.flip180 ? 180 : 0;
}

// The service computes the list; an older one sends none, so offer the two
// turns that service could already apply (plus the quarter turns when the
// glass is known to mount portrait).
export function resolveSupportedRotations(supported: readonly number[] | undefined, supportsPortrait: boolean): PanelRotation[] {
  const fromService = (supported ?? []).map(normalizeRotation).filter((r): r is PanelRotation => r !== undefined);
  if (fromService.length > 0) return fromService;
  return supportsPortrait ? [...ROTATIONS] : [0, 180];
}

export function usesDegreeLabels(surface: PanelSurface): boolean {
  return surface === 'lcd-round' || surface === 'lcd-square';
}

export function rotationOptions(
  rotations: readonly PanelRotation[],
  surface: PanelSurface,
  t: (key: string) => string,
): { value: string; label: string }[] {
  const degrees = usesDegreeLabels(surface);
  return rotations.map(r => ({
    value: String(r),
    label: degrees ? `${r}°` : t(`devices.y70.orientation.${RECT_ORIENTATION_KEY[r]}`),
  }));
}
