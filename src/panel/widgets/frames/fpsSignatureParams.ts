// Pure derivation of the cloud FPS-signature query from the local service's
// /system/specs display strings (see useSystemSpecs). No network calls here
// so the parsing can be unit tested without mocking fetch.
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import type { FpsSignatureParams } from '../../../types/fps-estimates';

const KIB = 1024;

/**
 * SystemSpecsCollector.cs formats a monitor as "{w}×{h} @ {hz} Hz",
 * "{w}×{h}" with no refresh reported, or just the monitor name with no
 * resolution at all - this matches the pair wherever it sits in the string
 * and tolerates an ASCII "x" in place of the multiplication sign.
 */
function parseMonitorResolution(monitor: string): { width: number; height: number; hz: number | null } | null {
  const m = /(\d+)\s*[×x]\s*(\d+)(?:\s*@\s*(\d+)\s*Hz)?/i.exec(monitor);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const hz = m[3] ? Number(m[3]) : null;
  return { width, height, hz: hz !== null && Number.isFinite(hz) && hz > 0 ? hz : null };
}

/**
 * SystemSpecsCollector.cs picks primaryGpu with the provider's integrated
 * flag (first discrete adapter, else the first). GraphicsCard joins every
 * adapter with " + " in enumeration order, which puts the iGPU first on
 * AMD-iGPU rigs, so its first segment is only a fallback for a service that
 * predates primaryGpu.
 */
function primaryGpuModel(specs: SystemSpecs): string | undefined {
  const primary = specs.primaryGpu?.trim();
  if (primary) return primary;
  const first = specs.graphicsCard.split(' + ')[0]?.trim();
  return first || undefined;
}

/**
 * SystemSpecsCollector.cs's FormatGb renders the total as "{n} GB" or, at
 * >= 1000 GiB, "{n} TB" (n has at most 2 decimals, trailing zeros trimmed) -
 * only the leading figure is parsed back, ignoring any DDR generation / stick
 * layout that follows.
 */
function parseRamBytes(memory: string): number | undefined {
  const m = /^([\d.]+)\s*(TB|GB|MB)\b/i.exec(memory.trim());
  if (!m) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = m[2].toUpperCase();
  if (unit === 'TB') return Math.round(value * KIB ** 4);
  if (unit === 'GB') return Math.round(value * KIB ** 3);
  return Math.round(value * KIB ** 2);
}

/**
 * Builds the /fps/signature query from a rig snapshot, or null when the
 * display resolution can't be parsed and no `res` override ("WxH") is given -
 * `res` is the only field the cloud route hard-requires, so an unparseable
 * monitor string means the rig can't be signed at all rather than a partial,
 * looser-ladder request. The rig's refresh rate rides along either way: it
 * only enters the exact-config ladder level.
 */
export function buildFpsSignatureParams(specs: SystemSpecs, res?: string): FpsSignatureParams | null {
  const resolution = parseMonitorResolution(specs.monitor);
  const resClass = res ?? (resolution ? `${resolution.width}x${resolution.height}` : null);
  if (!resClass) return null;
  return {
    gpu: primaryGpuModel(specs),
    cpu: specs.processor || undefined,
    mobo: specs.motherboard || undefined,
    ramBytes: parseRamBytes(specs.memory),
    res: resClass,
    hz: resolution?.hz ?? undefined,
  };
}
