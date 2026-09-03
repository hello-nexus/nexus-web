import { Button } from '../../../../components/common/Button/Button';
import { DeviceCountSummary } from '../../../../components/common/DeviceCountSummary/DeviceCountSummary';
import { IconLabelButton } from '../../../../components/common/IconLabelButton/IconLabelButton';
import { SimpleModeNotice } from '../../../../components/common/SimpleModeNotice/SimpleModeNotice';
import { pluralKey } from '../../../../lib/pluralKey';
import { useTranslation } from '../../../../lib/i18n';
import { COOLING_MODES, type CoolingModeKey } from '../page/coolingModes';
import type { CoolingImmersiveController } from './useCoolingImmersive';
import styles from './CoolingImmersiveModes.module.scss';

// The desktop simple page's three tiles plus Off, which that page keeps in a
// menu a touch panel does not have. Custom means editing curves: a notice, not a tile.
const TILE_KEYS: readonly CoolingModeKey[] = ['silent', 'balanced', 'turbo', 'off'];

/** Immersive cell 1: the mode tiles over the Nexus Control summary, the desktop simple mode's shape. */
export function CoolingImmersiveModes({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t, language } = useTranslation();
  const { activeMode, channels, controlledFanCount } = cooling;
  const tiles = TILE_KEYS.map(key => COOLING_MODES.find(m => m.key === key)!);

  return (
    <div className={styles.modes}>
      <div className={styles.tiles} role="group" aria-label={t('cooling.title')}>
        {tiles.map(m => (
          <IconLabelButton
            key={m.key}
            className={styles.tile}
            icon={<m.Icon size={32} aria-hidden />}
            label={t(m.i18nKey)}
            description={t(m.key === 'off' ? 'cooling.modeMenu.offDesc' : `cooling.mode.${m.key}.desc`)}
            active={activeMode === m.key}
            onPress={() => cooling.applyMode(m.key)}
          />
        ))}
      </div>
      {activeMode === 'custom' && (
        <SimpleModeNotice message={t('cooling.immersive.customActive')} />
      )}
      {/* What Off did while it is off, both counts otherwise, and the action only while it can resolve something. */}
      <DeviceCountSummary
        detected={activeMode === 'off'
          ? t('cooling.mode.off.banner')
          : t(pluralKey('cooling.simple.controlledOf', language, channels.length), {
            controlled: controlledFanCount,
            total: channels.length,
          })}
        action={activeMode !== 'off' && controlledFanCount < channels.length ? (
          <Button size="sm" pill onClick={cooling.claimAllFans}>
            {t('cooling.simple.controlAll')}
          </Button>
        ) : undefined}
      />
    </div>
  );
}
