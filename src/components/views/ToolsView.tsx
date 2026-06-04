import { useState, useEffect, lazy, Suspense } from 'react';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { fetchService } from '../../api/service';
import { useTranslation } from '../../lib/i18n';
import { ServiceRequired } from './ServiceRequired';
import { GenericSkeleton } from './PageSkeleton/PageSkeleton';
import { Card } from '../common/Card/Card';
import { Button } from '../common/Button/Button';
// Storybook lives behind the debug Tools page. Lazy so the component-catalog
// chunk is split out and only fetched when the user opens it.
const StorybookModal = lazy(() =>
  import('../../storybook/StorybookModal').then(m => ({ default: m.StorybookModal })),
);
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
import { fetchInstallDefaults, fetchInstallDefaultsSnapshot, type InstallDefaultsDocument } from '../../api/installDefaults';
import { DeviceModal } from '../common/DeviceModal/DeviceModal';
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
 * Internal Debug Tools page, rendered as the "Dev tools" tab inside the
 * Settings page. The tab label supplies the page heading, so this view
 * starts straight at the card grid. Cards here are diagnostics + developer
 * utilities only.
 */
export function ToolsView({ serviceOnline, connectionState }: ToolsViewProps) {
  if (!serviceOnline) {
    return (
      <div className={styles.tools}>
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.tools}>
      <div className={styles.grid}>
        <StorybookCard />
        <WidgetSdkCard />
        <TelemetryEventsCard />
        <InstallDefaultsCard />
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
    <Card title={t('tools.storybook')}>
      <span className={styles.dim}>{t('tools.storybook.label')}</span>
      <Button tone="accent" size="sm" onClick={() => setOpen(true)}>{t('tools.storybook.open')}</Button>
      {open && (
        <Suspense fallback={null}>
          <StorybookModal open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </Card>
  );
}

/**
 * Widget SDK reference card. Opens the storybook-style /widget-reference
 * page in a new tab — every meter tag, binding function, data source type,
 * and dispatch action with live previews.
 */
function WidgetSdkCard() {
  return (
    <Card title="Widget SDK reference">
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

/**
 * Telemetry events reference card. Opens /telemetry-reference — every product
 * event sent to PostHog, what it means, when it fires, and its parameters.
 */
function TelemetryEventsCard() {
  return (
    <Card title="Telemetry events">
      <span className={styles.dim}>
        Every product-analytics event the app sends to PostHog — what it records, when it
        fires, and its parameters. The API lookup for our telemetry.
      </span>
      <Button tone="accent" size="sm" onClick={() => {
        window.open('/telemetry-reference', '_blank', 'noopener,noreferrer');
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

// Install-defaults export. The card holds an Open button; the modal shows
// every section's current JSON inline with its own Copy button. Each Copy
// puts the matching `"key": <value>` fragment on the clipboard so the user
// can find-and-replace the corresponding block in
// nexus-service/data/install-defaults.json.
//
// "dashboard" is a virtual row mapping to panel.layouts.desktop.
function InstallDefaultsCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card title="Install defaults">
      <span className={styles.dim}>
        Open the snapshot, copy any section's current values, and paste over the matching
        block in <code>nexus-service/data/install-defaults.json</code> to make them the new defaults.
      </span>
      <Button tone="accent" size="sm" onClick={() => setOpen(true)}>Open snapshot</Button>
      <InstallDefaultsModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

interface SectionDef {
  key: keyof InstallDefaultsDocument;
}

const SECTIONS: SectionDef[] = [
  { key: 'theme' },
  { key: 'monitoring' },
  { key: 'panel' },
  { key: 'overlay' },
  { key: 'lighting' },
  { key: 'y70' },
  { key: 'keeb' },
  { key: 'cooling' },
  { key: 'obs' },
  { key: 'screenTime' },
  { key: 'cnvs' },
  { key: 'auth' },
];

function InstallDefaultsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'current' | 'defaults'>('current');
  const [snapshot, setSnapshot] = useState<InstallDefaultsDocument | null>(null);
  const [canonical, setCanonical] = useState<InstallDefaultsDocument | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetchInstallDefaultsSnapshot().catch(() => null),
      fetchInstallDefaults().catch(() => null),
    ]).then(([snap, canon]) => {
      if (cancelled) return;
      setSnapshot(snap);
      setCanonical(canon);
    });
    return () => { cancelled = true; };
  }, [open]);

  const doc = tab === 'current' ? snapshot : canonical;

  return (
    <DeviceModal open={open} onClose={onClose} wide title="Install defaults">
      <div className={styles.installDefaultsModal}>
        <p className={styles.dim}>
          Copy any section's values and paste over the matching block in
          <code> nexus-service/data/install-defaults.json</code> to make them the new defaults.
        </p>
        <div className={styles.installDefaultsTabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'current'}
            className={`${styles.installDefaultsTab} ${tab === 'current' ? styles.installDefaultsTabActive : ''}`}
            onClick={() => setTab('current')}>Current</button>
          <button type="button" role="tab" aria-selected={tab === 'defaults'}
            className={`${styles.installDefaultsTab} ${tab === 'defaults' ? styles.installDefaultsTabActive : ''}`}
            onClick={() => setTab('defaults')}>Defaults</button>
        </div>
        {!doc ? (
          <p className={styles.dim}>Loading…</p>
        ) : (
          <InstallDefaultsTabBody doc={doc} tab={tab} />
        )}
      </div>
    </DeviceModal>
  );
}

function InstallDefaultsTabBody({ doc, tab }: { doc: InstallDefaultsDocument; tab: 'current' | 'defaults' }) {
  const [copied, setCopied] = useState<string | null>(null);

  const formatFragment = (key: string, value: unknown) => {
    const wrapped = JSON.stringify({ [key]: value }, null, 2);
    return wrapped.replace(/^\{\n/, '').replace(/\n\}$/, '').replace(/^ {2}/gm, '');
  };

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(prev => prev === id ? null : prev), 1200);
  };

  const copyAllId = `__all__-${tab}`;
  const allText = JSON.stringify(doc, null, 2);

  return (
    <>
      <div className={styles.installDefaultsTopBar}>
        <Button tone="accent" size="sm" onClick={() => copy(copyAllId, allText)}>
          {copied === copyAllId ? 'Copied!' : `Copy entire ${tab === 'current' ? 'snapshot' : 'defaults'}`}
        </Button>
      </div>
      <div className={styles.installDefaultsSections}>
        {SECTIONS.map(s => {
          const value = doc[s.key];
          const fragment = formatFragment(s.key, value);
          const id = `${s.key}-${tab}`;
          return (
            <details key={s.key} className={styles.installDefaultsSection}>
              <summary className={styles.installDefaultsSectionHeader}>
                <code className={styles.installDefaultsKey}>{s.key}</code>
                {/* Span guards click-bubbling so the button toggle doesn't also
                    flip the parent <details> open/closed. */}
                <span onClick={e => e.preventDefault()}>
                  <button
                    type="button"
                    className={styles.installDefaultsCopy}
                    onClick={e => { e.stopPropagation(); copy(id, fragment); }}
                  >
                    {copied === id ? 'Copied!' : 'Copy'}
                  </button>
                </span>
              </summary>
              <pre className={styles.installDefaultsJson}>{JSON.stringify(value, null, 2)}</pre>
            </details>
          );
        })}
      </div>
    </>
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
    <Card title="Panel test devices">
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
              <Button
                type="button"
                tone={connected ? 'danger' : 'accent'}
                size="sm"
                onClick={() => toggle(panel.id)}
              >
                {connected ? 'Disconnect' : 'Connect'}
              </Button>
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
