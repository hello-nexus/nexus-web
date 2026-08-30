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
 * SystemSpecsCollector.cs's GraphicsCard joins every GPU with " + ", dGPU
 * first (NVIDIA/AMD are enumerated before the Intel iGPU on every dual-GPU
 * rig this checks against) - the first segment is the card that renders.
 */
function primaryGpuModel(graphicsCard: string): string | undefined {
  const first = graphicsCard.split(' + ')[0]?.trim();
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
 * display resolution can't be parsed - `res` is the only field the cloud
 * route hard-requires, so an unparseable monitor string means the rig can't
 * be signed at all rather than a partial, looser-ladder request.
 */
export function buildFpsSignatureParams(specs: SystemSpecs): FpsSignatureParams | null {
  const resolution = parseMonitorResolution(specs.monitor);
  if (!resolution) return null;
  return {
    gpu: primaryGpuModel(specs.graphicsCard),
    cpu: specs.processor || undefined,
    mobo: specs.motherboard || undefined,
    ramBytes: parseRamBytes(specs.memory),
    res: `${resolution.width}x${resolution.height}`,
    hz: resolution.hz ?? undefined,
  };
}
