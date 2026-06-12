import { useMemo } from 'react';
import type { MappingArtifact } from '../../../../api/lighting';
import { artifactPreviewDots, previewDotRadius } from './mappingUtils';
import styles from './CommunityMappings.module.scss';

// Preview viewBox; matches the editor canvas's wide aspect so a layout reads
// the same here and on the full canvas.
const VIEW_W = 96;
const VIEW_H = 54;
// Inner padding so edge LEDs are not clipped by the frame.
const PAD = 5;

/**
 * Static LED-dot rendering of an artifact's first zone. This visual is the
 * community's main garbage filter: a nonsense layout should be obvious at a
 * glance, so dots are drawn exactly where the artifact puts them.
 */
export function MappingPreview({ artifact, label }: {
  artifact: MappingArtifact | null | undefined;
  label: string;
}) {
  const dots = useMemo(() => artifactPreviewDots(artifact), [artifact]);
  const r = previewDotRadius(dots.length);
  return (
    <svg
      className={styles.preview}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={label}
    >
      {/* Key by array position: a malformed payload can repeat LED indices,
          and duplicate keys would drop dots from the render. */}
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={PAD + d.u * (VIEW_W - 2 * PAD)}
          cy={PAD + d.v * (VIEW_H - 2 * PAD)}
          r={r}
          className={d.disabled ? styles.previewDotDisabled : styles.previewDot}
        />
      ))}
    </svg>
  );
}
