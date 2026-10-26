import { Fragment } from 'react';
import { WandSparkles } from 'lucide-react';
import type { LightingDevice } from '../../../../api/lighting';
import { Button } from '../../../../components/common/Button/Button';
import { useTranslation } from '../../../../lib/i18n';
import { DEVICE_DRAG_TYPE } from './SceneViewport';
import styles from './Scene.module.scss';

interface SceneDevicePanelProps {
  devices: LightingDevice[];
  isPlaced: (deviceId: string) => boolean;
  whereLabel: (deviceId: string) => string;
  activeId: string | null;
  /** Devices auto-place found no free spot for. */
  missing: ReadonlySet<string>;
  emphasizeAutoPlace: boolean;
  onSelect: (deviceId: string) => void;
  onAutoPlace: () => void;
  onAddInBuild: () => void;
}

/** The placeable devices docked beside the scene canvas; a row is dragged onto a spot or clicked, then a spot clicked. */
export function SceneDevicePanel({
  devices, isPlaced, whereLabel, activeId, missing, emphasizeAutoPlace, onSelect, onAutoPlace, onAddInBuild,
}: SceneDevicePanelProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.devicePanel} aria-label={t('lighting.scene.devices.title')}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>{t('lighting.scene.devices.title')}</div>
        <Button size="sm" tone={emphasizeAutoPlace ? 'accent' : 'neutral'} icon={<WandSparkles size={13} strokeWidth={1.8} />} onClick={onAutoPlace}>
          {t('lighting.scene.devices.autoPlace')}
        </Button>
      </div>
      <div className={styles.sectionNote}>{t('lighting.scene.devices.note')}</div>
      <div className={styles.deviceList}>
        {devices.map(d => {
          const placed = isPlaced(d.id);
          const active = d.id === activeId;
          return (
            <Fragment key={d.id}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={active}
                className={`${styles.deviceRow} ${active ? styles.deviceRowActive : ''}`}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData(DEVICE_DRAG_TYPE, d.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onSelect(d.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(d.id);
                  }
                }}
              >
                <span className={`${styles.deviceDot} ${placed ? styles.deviceDotPlaced : ''}`} />
                <span className={styles.deviceText}>
                  <span className={styles.deviceName}>{d.name}</span>
                  <span className={styles.deviceWhere}>{whereLabel(d.id)}</span>
                </span>
              </div>
              {missing.has(d.id) && !placed && (
                <button type="button" className={styles.deviceLink} onClick={onAddInBuild}>
                  {t('lighting.scene.devices.addInBuild')}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
