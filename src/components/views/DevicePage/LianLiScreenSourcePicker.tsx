import { useEffect, useState } from 'react';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingSlider } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { SquareRegionPicker } from '../../common/SquareRegionPicker/SquareRegionPicker';
import { ScreenPreviewCanvas } from '../../common/ScreenPreviewCanvas/ScreenPreviewCanvas';
import {
  CENTERED_REGION,
  MIN_REGION_SIZE,
  isCentered,
  resizeRegion,
  resolveRegion,
  type SquareRegion,
} from '../../common/SquareRegionPicker/squareRegion';
import { fetchScreenMonitors, type ScreenSyncOptions } from '../../../api/lighting';
import type { LianLiScreenSource } from '../../../api/lianli-wireless';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './LianLiWirelessDevicePage.module.scss';

const DEFAULT_ASPECT = 16 / 9;
const PERCENT = 100;

/** The default source: the main display, largest centered square. */
export const DEFAULT_SCREEN_SOURCE: LianLiScreenSource = { displayId: '', cropX: 0, cropY: 0, cropSize: 0 };

const toRegion = (s: LianLiScreenSource): SquareRegion => ({ x: s.cropX, y: s.cropY, size: s.cropSize });
const withRegion = (s: LianLiScreenSource, r: SquareRegion): LianLiScreenSource => ({ ...s, cropX: r.x, cropY: r.y, cropSize: r.size });

interface LianLiScreenSourcePickerProps {
  value: LianLiScreenSource;
  /** Local state while a drag is in progress. */
  onPreview: (value: LianLiScreenSource) => void;
  /** Saves the choice. */
  onCommit: (value: LianLiScreenSource) => void;
  /** Names the region for assistive technology and the size slider. */
  label: string;
}

/**
 * Which display a screen shows live (or is captured from) and the square cut from it. The
 * picture is the Mirror preview stream, which follows the Mirror tab's display, so another
 * display shows the square on a plain frame.
 */
export function LianLiScreenSourcePicker({ value, onPreview, onCommit, label }: LianLiScreenSourcePickerProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [options, setOptions] = useState<ScreenSyncOptions | null>(null);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [previewGone, setPreviewGone] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchScreenMonitors().catch(() => null).then(o => { if (alive) setOptions(o); });
    return () => { alive = false; };
  }, []);

  const monitors = options?.monitors ?? [];
  const mirrorId = options?.selectedMonitor ?? monitors[0]?.id ?? '';
  const displayId = value.displayId || mirrorId;
  // The OS picker chooses the display on some platforms, so there is nothing to select.
  const canChoose = options?.selectionMode !== 'system' && monitors.length > 1;
  const previewing = !previewGone && (!displayId || displayId === mirrorId);
  const region = toRegion(value);
  const resolved = resolveRegion(region, aspect);
  const sizePercent = Math.round((region.size <= 0 ? 1 : resolved.size) * PERCENT);

  return (
    <div className={styles.typePanel}>
      {canChoose && (
        <SettingRow label={t('devices.lianli-flex.screenSourceDisplay')}>
          <Select
            value={displayId}
            options={monitors.map(m => ({ value: m.id, label: m.name }))}
            ariaLabel={t('devices.lianli-flex.screenSourceDisplay')}
            onChange={id => onCommit({ ...value, displayId: id })}
          />
        </SettingRow>
      )}
      <SquareRegionPicker
        aspect={aspect}
        region={region}
        ariaLabel={label}
        onPreview={r => onPreview(withRegion(value, r))}
        onCommit={r => onCommit(withRegion(value, r))}
      >
        {previewing
          ? <ScreenPreviewCanvas onSize={(w, h) => { if (h > 0) setAspect(w / h); }} onUnavailable={() => setPreviewGone(true)} />
          : t('devices.lianli-flex.screenSourceNoPreview')}
      </SquareRegionPicker>
      <SettingSlider
        editable
        trackFill
        label={t('devices.lianli-flex.screenSourceSize')}
        value={sizePercent}
        min={Math.round(MIN_REGION_SIZE * PERCENT)}
        max={PERCENT}
        step={1}
        formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
        ariaLabel={t('devices.lianli-flex.screenSourceSize')}
        onChange={(v: number, done?: boolean) => {
          const next = withRegion(value, resizeRegion(region, aspect, v / PERCENT));
          if (done) onCommit(next);
          else onPreview(next);
        }}
        onCommit={(v: number) => onCommit(withRegion(value, resizeRegion(region, aspect, v / PERCENT)))}
      />
      <SettingRow label={t('devices.lianli-flex.screenSourceReset')}>
        <Button
          size="sm"
          tone="neutral"
          disabled={isCentered(region)}
          onClick={() => onCommit(withRegion(value, CENTERED_REGION))}
        >
          {t('devices.lianli-flex.screenSourceResetButton')}
        </Button>
      </SettingRow>
    </div>
  );
}
