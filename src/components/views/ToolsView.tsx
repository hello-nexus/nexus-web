import { useState, useEffect } from 'react';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { fetchService } from '../../api/service';
import { useTranslation } from '../../lib/i18n';
import { ServiceRequired } from './ServiceRequired';
import { GenericSkeleton } from './PageSkeleton/PageSkeleton';
import { Card } from '../Card/Card';
import { Button } from '../Button/Button';
import { StorybookModal } from '../../storybook/StorybookModal';
import {
  formatPanelInches,
  getAllSimulatedPanels,
  getConnectedSimulatedPanelIds,
  getCustomSimulatedPanel,
  getPanelGridSizingSettings,
  getSimulatedPanelGridCapacity,
  getSimulatedPanelPhysicalSize,
  setPanelGridSizingSettings,
  setCustomSimulatedPanelSize,
  setSimulatedPanelConnected,
} from '../../lib/panelSimulation';
import { FontDebugCard } from './FontDebugCard';
import styles from './ToolsView.module.scss';

interface ToolsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
}

interface PawnIoStatus {
  installed: boolean;
  open: boolean;
}

/*
 * Internal Debug Tools page. Not shipped to end users; the Sidebar exposes
 * this behind the debug gear. Cards here are diagnostics + developer
 * utilities only - no public-facing features.
 */
export function ToolsView({ serviceOnline, connectionState }: ToolsViewProps) {
  const { t } = useTranslation();

  if (!serviceOnline) {
    return (
      <div className={styles.tools}>
        <h2 className={styles.title}>{t('tools.title')}</h2>
        <p className={styles.subtitle}>{t('tools.subtitle')}</p>
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.tools}>
      <h2 className={styles.title}>{t('tools.title')}</h2>
      <p className={styles.subtitle}>{t('tools.subtitle')}</p>
      <div className={styles.grid}>
        <StorybookCard />
        <WidgetSdkCard />
        <PawnIoCard />
        <PanelSimulatorCard />
        <FontDebugCard />
      </div>
    </div>
  );
}

function StorybookCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card title={t('tools.storybook')} className={styles.wide}>
      <span className={styles.dim}>{t('tools.storybook.label')}</span>
      <Button tone="accent" size="sm" onClick={() => setOpen(true)}>{t('tools.storybook.open')}</Button>
      <StorybookModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

/**
 * Widget SDK reference card. Opens the storybook-style /widget-reference
 * page in a new tab — every meter tag, every binding function, every data
 * source type, every dispatch action with live previews. This is the
 * system bible we hand to third-party widget authors AND review ourselves
 * as the SDK grows.
 */
function WidgetSdkCard() {
  return (
    <Card title="Widget SDK reference" className={styles.wide}>
      <span className={styles.dim}>
        Every meter, binding function, data source, dispatch action, capability — with live previews.
        Acts as the bible for the declarative widget SDK and 3rd-party widget authors.
      </span>
      <Button tone="accent" size="sm" onClick={() => {
        window.open('/widget-reference', '_blank', 'noopener,noreferrer');
      }}>Open reference</Button>
    </Card>
  );
}

function PawnIoCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PawnIoStatus | null>(null);

  useEffect(() => {
    fetchService<PawnIoStatus>('/pawnio').then(data => {
      if (data) setStatus(data);
    });
  }, []);

  return (
    <Card title={t('tools.pawnio')}>
      {status ? (
        <>
          <div className={styles.kv}>
            <span>{t('tools.pawnio.installed')}</span>
            <span className={`${styles.val} ${status.installed ? styles.good : ''}`}>
              {status.installed ? t('tools.yes') : t('tools.no')}
            </span>
          </div>
          <div className={styles.kv}>
            <span>{t('tools.pawnio.running')}</span>
            <span className={`${styles.val} ${status.open ? styles.good : ''}`}>
              {status.open ? t('tools.yes') : t('tools.no')}
            </span>
          </div>
        </>
      ) : (
        <span className={styles.dim}>{t('tools.pawnio.loading')}</span>
      )}
    </Card>
  );
}

function PanelSimulatorCard() {
  const [connectedIds, setConnectedIds] = useState(() => getConnectedSimulatedPanelIds());
  const [customWidth, setCustomWidth] = useState(() => getCustomSimulatedPanel().width);
  const [customHeight, setCustomHeight] = useState(() => getCustomSimulatedPanel().height);
  const [customDpi, setCustomDpi] = useState(() => getCustomSimulatedPanel().dpi);
  const [gridSizing, setGridSizing] = useState(() => getPanelGridSizingSettings());

  const customPhysical = getSimulatedPanelPhysicalSize({
    width: customWidth,
    height: customHeight,
    dpi: customDpi,
  });

  const refresh = () => {
    setConnectedIds(getConnectedSimulatedPanelIds());
    setGridSizing(getPanelGridSizingSettings());
  };

  const toggle = (id: string) => {
    setSimulatedPanelConnected(id, !connectedIds.includes(id));
    refresh();
  };

  const applyCustom = () => {
    setCustomSimulatedPanelSize(customWidth, customHeight, customDpi);
    setSimulatedPanelConnected('custom', true);
    refresh();
  };

  const updateJumpAtInches = (value: number) => {
    setPanelGridSizingSettings({ shortSideJumpAtInches: value });
    refresh();
  };

  return (
    <Card title="Panel test devices" className={styles.wide}>
      <span className={styles.dim}>Fake-connect panel targets for local screenshots, videos, and touch/editor testing.</span>
      <div className={styles.simTuningRow}>
        <label className={styles.tuningField}>
          <span>Short-side jump</span>
          <input
            className={styles.dimensionInput}
            type="number"
            min={1}
            max={16}
            step={0.1}
            value={gridSizing.shortSideJumpAtInches}
            aria-label="Short-side grid jump inches"
            onChange={e => updateJumpAtInches(Number(e.target.value))}
          />
        </label>
        <span className={styles.dim}>in short side</span>
      </div>
      <div className={styles.simList}>
        {getAllSimulatedPanels().map(panel => {
          const connected = connectedIds.includes(panel.id);
          const isCustom = panel.id === 'custom';
          const capacity = getSimulatedPanelGridCapacity(panel);
          const physical = getSimulatedPanelPhysicalSize(panel);
          return (
            <div key={panel.id} className={styles.simRow}>
              <div className={styles.simMeta}>
                <strong>{panel.name}</strong>
                <span>{panel.surface} - {panel.width}x{panel.height} @ {panel.dpi} dpi - short {formatPanelInches(physical.shortSideInches)} / diag {formatPanelInches(physical.diagonalInches)} - {capacity.columns}x{capacity.rows} widget grid</span>
              </div>
              <button type="button" className={connected ? styles.btnDanger : styles.btn} onClick={() => toggle(panel.id)}>
                {connected ? 'Disconnect' : 'Connect'}
              </button>
              {isCustom && (
                <div className={styles.customControls}>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={240}
                    max={4096}
                    value={customWidth}
                    aria-label="Custom panel width"
                    onChange={e => setCustomWidth(Number(e.target.value))}
                  />
                  <span className={styles.dim}>x</span>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={240}
                    max={4096}
                    value={customHeight}
                    aria-label="Custom panel height"
                    onChange={e => setCustomHeight(Number(e.target.value))}
                  />
                  <span className={styles.dim}>@</span>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={72}
                    max={600}
                    value={customDpi}
                    aria-label="Custom panel DPI"
                    onChange={e => setCustomDpi(Number(e.target.value))}
                  />
                  <span className={styles.dim}>dpi</span>
                  <input
                    className={`${styles.dimensionInput} ${styles.readonlyInput}`}
                    type="text"
                    readOnly
                    value={`short ${formatPanelInches(customPhysical.shortSideInches)}`}
                    aria-label="Custom panel short side inches"
                  />
                  <input
                    className={`${styles.dimensionInput} ${styles.readonlyInput}`}
                    type="text"
                    readOnly
                    value={`diag ${formatPanelInches(customPhysical.diagonalInches)}`}
                    aria-label="Custom panel diagonal inches"
                  />
                  <Button type="button" tone="accent" size="sm" onClick={applyCustom} className={styles.applyBtn}>Apply</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
