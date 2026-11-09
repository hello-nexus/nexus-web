export type PanelRotation = 0 | 90 | 180 | 270;

const ROTATIONS: readonly PanelRotation[] = [0, 90, 180, 270];

export function normalizeRotation(value: number | null | undefined): PanelRotation | undefined {
  return ROTATIONS.find(r => r === value);
}

// Older services only send flip180 and portrait, so they stand in until rotation arrives.
export function resolveRecordRotation(record: { rotation?: number | null; flip180?: boolean | null; portrait?: boolean | null } | null | undefined): PanelRotation {
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

// Degrees on every surface: a quarter turn names the same mounting whatever the glass's shape.
export function rotationOptions(rotations: readonly PanelRotation[]): { value: string; label: string }[] {
  return rotations.map(r => ({ value: String(r), label: `${r}°` }));
}
