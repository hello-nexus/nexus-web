import { useEffect, useState } from 'react';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import type { LianLiOverlay, LianLiOverlayType, LianLiWirelessMediaItem } from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

const NO_BACKGROUND = '';
// One value column for every slider here, so their tracks line up.
const VALUE_WIDTH_CH = 7;
const SCREEN_SIZE = 400;
const OVERLAY_TYPES: LianLiOverlayType[] = ['circular', 'rotate', 'bounce', 'collision'];

export const DEFAULT_OVERLAY: LianLiOverlay = {
  type: 'circular',
  spriteMediaId: '',
  speed: 5,
  loop: true,
  zoom: 100,
  direction: 0,
  centerX: SCREEN_SIZE / 2,
  centerY: SCREEN_SIZE / 2,
  params: {},
};

const TYPE_LABEL_KEYS: Record<LianLiOverlayType, string> = {
  circular: 'devices.lianli-flex.anim2dCircular',
  rotate: 'devices.lianli-flex.anim2dRotate',
  bounce: 'devices.lianli-flex.anim2dBounce',
  collision: 'devices.lianli-flex.anim2dCollision',
};

interface LianLiFlexAnimation2dPanelProps {
  /** The overlay the selected screen plays, if any. */
  overlay: LianLiOverlay | undefined;
  backgroundMediaId: string | undefined;
  media: readonly LianLiWirelessMediaItem[];
  /** Saves the overlay and its background. Called only once a sprite is chosen. */
  onCommit: (overlay: LianLiOverlay, backgroundMediaId: string | undefined) => void;
}

/** A sprite moving over the screen's background: its motion, speed, size and position. */
export function LianLiFlexAnimation2dPanel({ overlay, backgroundMediaId, media, onCommit }: LianLiFlexAnimation2dPanelProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [draft, setDraft] = useState<LianLiOverlay>(overlay ?? DEFAULT_OVERLAY);
  const [background, setBackground] = useState(backgroundMediaId ?? NO_BACKGROUND);

  // The screen's saved overlay is the truth between edits.
  const savedKey = JSON.stringify(overlay ?? null);
  useEffect(() => {
    setDraft(overlay ?? DEFAULT_OVERLAY);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey stands for overlay
  }, [savedKey]);
  useEffect(() => { setBackground(backgroundMediaId ?? NO_BACKGROUND); }, [backgroundMediaId]);

  const pictures = media.filter(m => m.kind === 'image' || m.kind === 'gif');
  const pictureOptions = pictures.map(m => ({ value: m.id, label: m.name }));
  const percent = (v: number) => localizeNumbers(`${v}%`, numberFormat);
  const pixels = (v: number) => t('devices.lianli-flex.pixels', { n: localizeNumbers(String(v), numberFormat) });
  const degrees = (v: number) => localizeNumbers(`${v}\u00B0`, numberFormat);
  const outOf = (max: number) => (v: number) => localizeNumbers(`${v}/${max}`, numberFormat);

  const save = (next: LianLiOverlay, bg: string = background) => {
    setDraft(next);
    if (next.spriteMediaId) onCommit(next, bg === NO_BACKGROUND ? undefined : bg);
  };
  const withParams = (patch: Partial<LianLiOverlay['params']>): LianLiOverlay => ({ ...draft, params: { ...draft.params, ...patch } });

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    apply: (v: number) => LianLiOverlay,
    format?: (v: number) => string,
    step = 1,
  ) => (
    <SettingSlider
      valueWidthCh={VALUE_WIDTH_CH}
      editable
      trackFill
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      formatValue={format ?? (v => localizeNumbers(String(v), numberFormat))}
      ariaLabel={label}
      onChange={(v: number, done?: boolean) => {
        if (done) save(apply(v));
        else setDraft(apply(v));
      }}
      onCommit={(v: number) => save(apply(v))}
    />
  );

  const { params } = draft;

  return (
    <div className={styles.typePanel}>
      <SettingRow label={t('devices.lianli-flex.anim2dType')}>
        <ChipGroup
          ariaLabel={t('devices.lianli-flex.anim2dType')}
          activeKey={draft.type}
          onChange={key => save({ ...draft, type: key as LianLiOverlayType })}
          options={OVERLAY_TYPES.map(type => ({ key: type, label: t(TYPE_LABEL_KEYS[type] as Parameters<typeof t>[0]) }))}
        />
      </SettingRow>
      <SettingSelect
        label={t('devices.lianli-flex.anim2dSprite')}
        value={draft.spriteMediaId}
        placeholder={t('devices.lianli-flex.anim2dSpritePlaceholder')}
        options={pictureOptions}
        onChange={v => save({ ...draft, spriteMediaId: v })}
      />
      <SettingSelect
        label={t('devices.lianli-flex.anim2dBackground')}
        value={background}
        options={[{ value: NO_BACKGROUND, label: t('devices.lianli-flex.anim2dNoBackground') }, ...pictureOptions]}
        onChange={v => { setBackground(v); save(draft, v); }}
      />
      {slider(t('devices.lianli-flex.anim2dSpeed'), draft.speed, 1, 10, v => ({ ...draft, speed: Math.round(v) }), outOf(10))}
      {slider(t('devices.lianli-flex.anim2dZoom'), draft.zoom, 50, 200, v => ({ ...draft, zoom: Math.round(v) }), percent)}
      {slider(t('devices.lianli-flex.anim2dCenterX'), draft.centerX, 0, SCREEN_SIZE, v => ({ ...draft, centerX: Math.round(v) }), pixels)}
      {slider(t('devices.lianli-flex.anim2dCenterY'), draft.centerY, 0, SCREEN_SIZE, v => ({ ...draft, centerY: Math.round(v) }), pixels)}
      <SettingRow label={t('devices.lianli-flex.anim2dDirection')}>
        <ChipGroup
          ariaLabel={t('devices.lianli-flex.anim2dDirection')}
          activeKey={String(draft.direction)}
          onChange={key => save({ ...draft, direction: Number(key) })}
          options={[
            { key: '0', label: t('devices.lianli-flex.anim2dClockwise') },
            { key: '1', label: t('devices.lianli-flex.anim2dCounterclockwise') },
          ]}
        />
      </SettingRow>
      <SettingToggle
        label={t('devices.lianli-flex.anim2dLoop')}
        checked={draft.loop}
        onChange={loop => save({ ...draft, loop })}
      />
      {draft.type === 'circular' && (
        <>
          {slider(t('devices.lianli-flex.anim2dRadius'), params.radius ?? 100, 0, 180, v => withParams({ radius: Math.round(v) }), pixels)}
          <SettingToggle
            label={t('devices.lianli-flex.anim2dSelfRotate')}
            checked={params.selfRotate === true}
            onChange={selfRotate => save(withParams({ selfRotate }))}
          />
        </>
      )}
      {draft.type === 'rotate' && (
        <>
          {slider(t('devices.lianli-flex.anim2dAngle'), params.rotateAngle ?? 0, 0, 359, v => withParams({ rotateAngle: Math.round(v) }), degrees)}
          <SettingToggle
            label={t('devices.lianli-flex.anim2dAutoReverse')}
            checked={params.autoReverse === true}
            onChange={autoReverse => save(withParams({ autoReverse }))}
          />
        </>
      )}
      {draft.type === 'bounce' && (
        <>
          {slider(t('devices.lianli-flex.anim2dHeight'), params.upHeight ?? 80, 0, 300, v => withParams({ upHeight: Math.round(v) }), pixels)}
          {slider(t('devices.lianli-flex.anim2dBounciness'), params.bounciness ?? 2, 0, 4, v => withParams({ bounciness: Math.round(v) }), outOf(4))}
          {slider(
            t('devices.lianli-flex.anim2dPause'),
            params.dwellSeconds ?? 0.2,
            0,
            2,
            v => withParams({ dwellSeconds: Math.round(v * 10) / 10 }),
            v => t('devices.lianli-flex.seconds', { n: localizeNumbers(String(v), numberFormat) }),
            0.1,
          )}
        </>
      )}
      {draft.type === 'collision' && (
        <SettingRow label={t('devices.lianli-flex.anim2dSpin')}>
          <ChipGroup
            ariaLabel={t('devices.lianli-flex.anim2dSpin')}
            activeKey={String(params.rotationIntensity ?? 1)}
            onChange={key => save(withParams({ rotationIntensity: Number(key) }))}
            options={[
              { key: '0', label: t('devices.lianli-flex.anim2dSpinLow') },
              { key: '1', label: t('devices.lianli-flex.anim2dSpinMedium') },
              { key: '2', label: t('devices.lianli-flex.anim2dSpinHigh') },
            ]}
          />
        </SettingRow>
      )}
    </div>
  );
}
