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
import { fetchInstallDefaultsSnapshot, type InstallDefaultsDocument } from '../../api/installDefaults';
import { DevicePopup } from '../DevicePopup/DevicePopup';
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
        <InstallDefaultsCard />
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

// Install-defaults export. The card holds an Open button; the popup shows
// every section's current JSON inline with its own Copy button. Each Copy
// puts the matching `"key": <value>` fragment on the clipboard so the user
// can find-and-replace the corresponding block in
// qos-service/data/install-defaults.json.
//
// "dashboard" is a virtual row that maps to panel.layouts.desktop (the
// install-defaults file nests it; users think of it as its own thing).
function InstallDefaultsCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card title="Install defaults" className={styles.wide}>
      <span className={styles.dim}>
        Open the snapshot, copy any section's current values, and paste over the matching
        block in <code>qos-service/data/install-defaults.json</code> to make them the new defaults.
      </span>
      <Button tone="accent" size="sm" onClick={() => setOpen(true)}>Open snapshot</Button>
      <InstallDefaultsPopup open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

interface SectionDef {
  key: string;
  /** Key as it appears in install-defaults.json — what goes on the clipboard
   *  alongside the value. May differ from `key` for virtual rows like
   *  "dashboard" → "desktop". */
  jsonKey: string;
  /** Resolves the current snapshot value for this section. */
  pick: (s: InstallDefaultsDocument) => unknown;
  /** Optional path hint shown under the label so the user knows where to
   *  paste (e.g. dashboard lives under panel.layouts). */
  path?: string;
}

const SECTIONS: SectionDef[] = [
  { key: 'theme',         jsonKey: 'theme',         pick: s => s.theme },
  { key: 'monitoring',    jsonKey: 'monitoring',    pick: s => s.monitoring },
  { key: 'panel',         jsonKey: 'panel',         pick: s => s.panel },
  { key: 'dashboard',     jsonKey: 'desktop',       pick: s => s.panel.layouts.desktop, path: 'panel.layouts.desktop' },
  { key: 'panel-y70',     jsonKey: 'y70',           pick: s => s.panel.layouts.y70,     path: 'panel.layouts.y70' },
  { key: 'panel-phone',   jsonKey: 'phone',         pick: s => s.panel.layouts.phone,   path: 'panel.layouts.phone' },
  { key: 'panel-q60',     jsonKey: 'q60',           pick: s => s.panel.layouts.q60,     path: 'panel.layouts.q60' },
  { key: 'overlay',       jsonKey: 'overlay',       pick: s => s.overlay },
  { key: 'lighting',      jsonKey: 'lighting',      pick: s => s.lighting },
  { key: 'y70',           jsonKey: 'y70',           pick: s => s.y70 },
  { key: 'keeb',          jsonKey: 'keeb',          pick: s => s.keeb },
  { key: 'cooling',       jsonKey: 'cooling',       pick: s => s.cooling },
  { key: 'obs',           jsonKey: 'obs',           pick: s => s.obs },
  { key: 'screenTime',    jsonKey: 'screenTime',    pick: s => s.screenTime },
  { key: 'cnvs',          jsonKey: 'cnvs',          pick: s => s.cnvs },
  { key: 'auth',          jsonKey: 'auth',          pick: s => s.auth },
];

function InstallDefaultsPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<InstallDefaultsDocument | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchInstallDefaultsSnapshot()
      .then(d => { if (!cancelled) setSnapshot(d); })
      .catch(() => { /* popup stays empty */ });
    return () => { cancelled = true; };
  }, [open]);

  const formatFragment = (jsonKey: string, value: unknown) => {
    // Build "key": <pretty-value> as a paste-ready snippet. Strip the outer
    // wrapper braces + outer indent so the fragment slots into an existing
    // object literal without extra punctuation.
    const wrapped = JSON.stringify({ [jsonKey]: value }, null, 2);
    return wrapped.replace(/^\{\n/, '').replace(/\n\}$/, '').replace(/^  /gm, '');
  };

  const formatBody = (value: unknown) => JSON.stringify(value, null, 2);

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(prev => prev === id ? null : prev), 1200);
  };

  const allText = snapshot ? JSON.stringify(snapshot, null, 2) : '';

  return (
    <DevicePopup open={open} onClose={onClose} large title="Install defaults">
      <div className={styles.installDefaultsPopup}>
        <p className={styles.dim}>
          Copy any section's current values; paste over the matching block in
          <code> qos-service/data/install-defaults.json</code> to make them the new defaults.
        </p>
        <div className={styles.installDefaultsTopBar}>
          <Button tone="accent" size="sm" disabled={!snapshot} onClick={() => copy('__all__', allText)}>
            {copied === '__all__' ? 'Copied!' : 'Copy entire snapshot'}
          </Button>
        </div>
        {!snapshot ? (
          <p className={styles.dim}>Loading…</p>
        ) : (
          <div className={styles.installDefaultsSections}>
            {SECTIONS.map(s => {
              const value = s.pick(snapshot);
              const fragment = formatFragment(s.jsonKey, value);
              return (
                <section key={s.key} className={styles.installDefaultsSection}>
                  <div className={styles.installDefaultsSectionHeader}>
                    <div className={styles.installDefaultsSectionLabel}>
                      <code className={styles.installDefaultsKey}>{s.key}</code>
                      {s.path && <span className={styles.installDefaultsPath}>{s.path}</span>}
                    </div>
                    <button
                      type="button"
                      className={styles.installDefaultsCopy}
                      onClick={() => copy(s.key, fragment)}
                    >
                      {copied === s.key ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className={styles.installDefaultsJson}>{formatBody(value)}</pre>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DevicePopup>
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
