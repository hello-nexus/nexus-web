import { Button } from '../../../components/common/Button/Button';
import { Card } from '../../../components/common/Card/Card';
import { HsvPicker } from '../../../components/common/HsvPicker/HsvPicker';
import { Overlay } from '../../../components/common/Overlay/Overlay';
import { Slider } from '../../../components/common/Slider/Slider';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { useTranslation } from '../../../lib/i18n';
import type { HaEntity, HaEntityAction } from '../../../api/homeAssistant';
import { controlOf, entityIcon, hasDetail, isActive, stateLabel } from './haDomains';
import styles from './HomeAssistantPage.module.scss';

// Color-temperature slider span in Kelvin, warm to daylight.
const COLOR_TEMP_MIN = 2000;
const COLOR_TEMP_MAX = 6500;

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export interface HaEntityHandlers {
  onToggle: (id: string, on: boolean) => void;
  onAction: (id: string, action: HaEntityAction) => void;
}

export function HaEntityTile({
  entity,
  name,
  onToggle,
  onAction,
  onOpenDetail,
}: HaEntityHandlers & {
  entity: HaEntity;
  // Dashboard-level name override; falls back to HA's friendly name.
  name?: string;
  onOpenDetail: (entity: HaEntity) => void;
}) {
  const { t, language } = useTranslation();
  const Icon = entityIcon(entity);
  const control = controlOf(entity.domain);
  const active = isActive(entity);
  const detail = hasDetail(entity);
  const label = name || entity.name;
  const badgeStyle = active
    ? entity.domain === 'light' && entity.rgb
      ? { background: `rgb(${entity.rgb.join(',')})` }
      : { background: 'var(--accent)' }
    : {};

  const onBadge = () => {
    switch (control) {
      case 'toggle': onToggle(entity.id, !entity.on); break;
      case 'run': onAction(entity.id, 'run'); break;
      case 'cover': onAction(entity.id, active ? 'close' : 'open'); break;
      // Unlocking is never a single tap: the badge opens the dialog instead.
      case 'lock': onOpenDetail(entity); break;
      default: break;
    }
  };

  // disableInteractiveRole: the tile's own badge button is the focusable
  // control; role="button" here would nest a focusable descendant inside a
  // button role.
  return (
    <Card
      interactive={detail}
      compact
      disableInteractiveRole
      onClick={detail ? () => onOpenDetail(entity) : undefined}
    >
      <div className={styles.tileInner} data-unreachable={!entity.reachable ? 'true' : 'false'}>
        {control === 'none' ? (
          <span className={styles.tileBadge} style={badgeStyle} data-on={active ? 'true' : 'false'} aria-hidden>
            <Icon size={20} />
          </span>
        ) : (
          <button
            type="button"
            className={styles.tileBadge}
            style={badgeStyle}
            data-on={active ? 'true' : 'false'}
            aria-label={label}
            aria-pressed={control === 'toggle' ? entity.on : undefined}
            aria-haspopup={control === 'lock' ? 'dialog' : undefined}
            disabled={!entity.reachable}
            onClick={e => {
              e.stopPropagation();
              onBadge();
            }}
          >
            <Icon size={20} />
          </button>
        )}
        <div className={styles.tileInfo}>
          <div className={styles.tileName}>{label}</div>
          <div className={styles.tileState}>{stateLabel(entity, t, language)}</div>
        </div>
      </div>
    </Card>
  );
}

export function HaMoreInfoDialog({
  entity,
  onClose,
  onToggle,
  onAction,
  onPreviewBrightness,
  onBrightness,
  onPreviewColor,
  onColor,
  onPreviewColorTemp,
  onColorTemp,
}: HaEntityHandlers & {
  entity: HaEntity | null;
  onClose: () => void;
  onPreviewBrightness: (id: string, pct: number) => void;
  onBrightness: (id: string, pct: number) => void;
  onPreviewColor: (id: string, rgb: [number, number, number]) => void;
  onColor: (id: string, rgb: [number, number, number]) => void;
  onPreviewColorTemp: (id: string, k: number) => void;
  onColorTemp: (id: string, k: number) => void;
}) {
  const { t, language } = useTranslation();
  const open = entity !== null;
  if (!entity) return null;

  const control = controlOf(entity.domain);
  const isLight = entity.domain === 'light';
  const hexColor = entity.rgb ? rgbToHex(entity.rgb) : '#ffffff';
  const hasLightControls = isLight && (entity.supportsBrightness || entity.supportsColor || entity.supportsColorTemp);
  const lockDisabled = !entity.reachable || entity.codeRequired;

  return (
    <Overlay open={open} onClose={onClose} variant="dialog" className={styles.moreInfoDialog} ariaLabel={entity.name}>
      <div className={styles.moreInfoHeader}>
        <div className={styles.moreInfoHeading}>
          <h3 className={styles.moreInfoTitle}>{entity.name}</h3>
          {control !== 'toggle' && (
            <span className={styles.moreInfoState}>{stateLabel(entity, t, language)}</span>
          )}
        </div>
        {control === 'toggle' && (
          <Toggle
            checked={entity.on}
            onChange={on => onToggle(entity.id, on)}
            ariaLabel={entity.name}
            disabled={!entity.reachable}
          />
        )}
      </div>
      {hasLightControls && (
        <div className={styles.moreInfoBody}>
          {entity.supportsBrightness && (
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('homeAssistant.brightness')}
              value={entity.brightnessPct}
              min={0}
              max={100}
              step={1}
              formatValue={v => `${v}%`}
              onChange={(pct, commit) => { onPreviewBrightness(entity.id, pct); if (commit) onBrightness(entity.id, pct); }}
              onCommit={pct => onBrightness(entity.id, pct)}
              disabled={!entity.reachable || !entity.on}
            />
          )}
          {entity.supportsColorTemp && (
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('homeAssistant.colorTemp')}
              value={entity.colorTempK}
              min={COLOR_TEMP_MIN}
              max={COLOR_TEMP_MAX}
              step={100}
              formatValue={v => `${v}K`}
              onChange={(k, commit) => { onPreviewColorTemp(entity.id, k); if (commit) onColorTemp(entity.id, k); }}
              onCommit={k => onColorTemp(entity.id, k)}
              disabled={!entity.reachable || !entity.on}
            />
          )}
          {entity.supportsColor && (
            <HsvPicker
              value={hexColor}
              onPreview={hex => onPreviewColor(entity.id, hexToRgb(hex))}
              onCommit={hex => onColor(entity.id, hexToRgb(hex))}
            />
          )}
        </div>
      )}
      {control === 'cover' && (
        <div className={styles.moreInfoActions}>
          <Button size="sm" disabled={!entity.reachable} onClick={() => onAction(entity.id, 'open')}>
            {t('homeAssistant.action.open')}
          </Button>
          <Button size="sm" disabled={!entity.reachable} onClick={() => onAction(entity.id, 'stop')}>
            {t('homeAssistant.action.stop')}
          </Button>
          <Button size="sm" disabled={!entity.reachable} onClick={() => onAction(entity.id, 'close')}>
            {t('homeAssistant.action.close')}
          </Button>
        </div>
      )}
      {control === 'lock' && (
        <>
          <div className={styles.moreInfoActions}>
            <Button size="sm" disabled={lockDisabled} onClick={() => onAction(entity.id, 'lock')}>
              {t('homeAssistant.action.lock')}
            </Button>
            <Button size="sm" disabled={lockDisabled} onClick={() => onAction(entity.id, 'unlock')}>
              {t('homeAssistant.action.unlock')}
            </Button>
          </div>
          {entity.codeRequired && <p className={styles.moreInfoNote}>{t('homeAssistant.lockCodeRequired')}</p>}
        </>
      )}
    </Overlay>
  );
}
