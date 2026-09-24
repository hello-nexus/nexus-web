/** Game resolutions offered as pickers, in the FPS cloud's resClass form; the first is the default. */
export const STANDARD_RESOLUTIONS = ['1920x1080', '2560x1440', '3840x2160'] as const;

const RES = /^(\d+)\s*[x×]\s*(\d+)$/;

/** A 16:9 size reads as its height plus "p"; any other ratio (ultrawide) keeps both sides. */
export function formatResolution(res: string): string {
  const m = RES.exec(res.trim());
  if (!m) return res;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w * 9 === h * 16 ? `${h}p` : `${w}×${h}`;
}
