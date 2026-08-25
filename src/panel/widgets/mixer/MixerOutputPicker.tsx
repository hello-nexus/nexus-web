import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { PanelArrowButton } from '../../chrome/PanelArrowButton';
import type { AudioDevice } from '../../../api/mixer';
import styles from './MixerWidget.module.scss';

// What a 4x4 tile fits under the docked back row, without shrinking the rows
// below a touch target.
const ROWS_PER_PAGE = 5;

export interface MixerOutputPickerProps {
  outputs: AudioDevice[];
  inputs: AudioDevice[];
  onSelectOutput: (deviceId: string) => void;
  onSelectInput: (deviceId: string) => void;
  onClose: () => void;
}

type Row = { kind: 'output' | 'input'; device: AudioDevice; label: string };

export function MixerOutputPicker({
  outputs,
  inputs,
  onSelectOutput,
  onSelectInput,
  onClose,
}: MixerOutputPickerProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  const rows: Row[] = [
    ...disambiguate(outputs).map(({ device, label }): Row => ({ kind: 'output', device, label })),
    ...disambiguate(inputs).map(({ device, label }): Row => ({ kind: 'input', device, label })),
  ];
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * ROWS_PER_PAGE, current * ROWS_PER_PAGE + ROWS_PER_PAGE);

  return (
    <>
    {/* Docked, not a list entry: it has to stay reachable on every page. */}
    <button type="button" className={styles.pickerBack} onClick={onClose}>
      <ArrowLeft className={styles.pickerBackIcon} strokeWidth={2.2} />
      <span className={styles.pickerRowName}>{t('panel.widget.mixer.aria.closePicker')}</span>
    </button>
    <div className={styles.pickerStage} data-paged={pages > 1 ? 'true' : 'false'}>
      {pages > 1 && (
        <PanelArrowButton
          side="prev"
          className={styles.pickerArrow}
          disabled={current === 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
          ariaLabel={t('panel.widget.mixer.aria.prevPage')}
        />
      )}
      <div className={styles.pickerRows}>
        {visible.map(row => (
          <button
            key={row.device.id}
            type="button"
            className={styles.pickerRow}
            data-active={row.device.isDefault ? 'true' : 'false'}
            aria-pressed={row.device.isDefault}
            onClick={() => (row.kind === 'output' ? onSelectOutput(row.device.id) : onSelectInput(row.device.id))}
          >
            <span className={styles.pickerKind}>
              {t(row.kind === 'output' ? 'panel.widget.mixer.output' : 'panel.widget.mixer.input')}
            </span>
            <span className={styles.pickerRowName}>{row.label}</span>
            {row.device.isDefault && <Check className={styles.pickerCheck} strokeWidth={2.2} />}
          </button>
        ))}
      </div>
      {pages > 1 && (
        <PanelArrowButton
          side="next"
          className={styles.pickerArrow}
          disabled={current >= pages - 1}
          onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
          ariaLabel={t('panel.widget.mixer.aria.nextPage')}
        />
      )}
    </div>
    </>
  );
}

/**
 * Endpoints can share a name verbatim - a GPU exposing one HDMI audio device
 * per port reports the monitor's name for each. Two identical rows leave the
 * operator guessing which one they picked, so repeats get an ordinal.
 */
function disambiguate(devices: AudioDevice[]): Array<{ device: AudioDevice; label: string }> {
  const counts = new Map<string, number>();
  for (const d of devices) counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return devices.map(device => {
    if ((counts.get(device.name) ?? 0) < 2) return { device, label: device.name };
    const n = (seen.get(device.name) ?? 0) + 1;
    seen.set(device.name, n);
    return { device, label: `${device.name} (${n})` };
  });
}
