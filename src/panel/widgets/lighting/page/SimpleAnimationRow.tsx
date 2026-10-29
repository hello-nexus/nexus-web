import { useId } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
import { SIMPLE_ANIMATION_KEYS, SIMPLE_SLOT, simpleAnimationLabelKey } from '../simpleAnimations';
import styles from '../LightingPage.module.scss';

// A tile spans two palette swatches and the gap between them; the swatches are
// square, so this is the aspect that lands the row flush with the grid above.
// paletteSpansTwoSwatches (simpleAnimations.test.ts) pins the column relation
// this rests on.
const TILE_ASPECT = 2.1;

function AnimationTile({ effectKey, version, active, noGpu, onSelect }: {
  effectKey: string;
  /** Cache-bust token of preset 1's look, so an edit in advanced refreshes the tile. */
  version: string;
  active: boolean;
  noGpu: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const label = t(simpleAnimationLabelKey(effectKey));
  const url = useEffectThumbnail(effectKey, SIMPLE_SLOT, version, noGpu);
  return (
    <EffectCard
      overlay
      dataEffectKey={effectKey}
      label={label}
      thumbUrl={url}
      thumbStatic={noGpu}
      thumbAspect={TILE_ASPECT}
      active={active}
      onClick={onSelect}
    />
  );
}

/**
 * Simple mode's animation row, sat under the colour palette. Picking one drives
 * every device the palette reaches; the switch beneath turns the animation around
 * (the shaders travel one way and the sign of the speed reverses them).
 */
export function SimpleAnimationRow({ activeKey, versionFor, reversed, gpuAvailable, onSelect, onReverse }: {
  /** The running animation, or null when a colour (or nothing) is driving. */
  activeKey: string | null;
  /** Thumbnail cache-bust token for an animation's preset 1. */
  versionFor: (key: string) => string;
  reversed: boolean;
  /** False when the host cannot render thumbnails; tiles show placeholders. */
  gpuAvailable?: boolean;
  onSelect: (key: string) => void;
  onReverse: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const noGpu = gpuAvailable === false;
  return (
    <div className={styles.simpleAnimations}>
      <div
        className={styles.simpleAnimationGrid}
        style={{ gridTemplateColumns: `repeat(${SIMPLE_ANIMATION_KEYS.length}, minmax(0, 1fr))` }}
      >
        {SIMPLE_ANIMATION_KEYS.map(key => (
          <AnimationTile
            key={key}
            effectKey={key}
            version={versionFor(key)}
            active={key === activeKey}
            noGpu={noGpu}
            onSelect={() => onSelect(key)}
          />
        ))}
      </div>
      <div className={styles.simpleAnimationDirection}>
        <ArrowLeftRight size={14} aria-hidden={true} />
        <span id={labelId}>{t('lighting.simple.reverse')}</span>
        <Toggle
          checked={reversed}
          ariaLabelledBy={labelId}
          onChange={onReverse}
        />
      </div>
    </div>
  );
}
