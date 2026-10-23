import { useState, useEffect, lazy, Suspense } from 'react';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { fetchService } from '../../api/service';
import { useTranslation } from '../../lib/i18n';
import { ServiceRequired } from './ServiceRequired';
import { Card } from '../common/Card/Card';
import { Button } from '../common/Button/Button';
// Storybook lives behind the debug Tools page. Lazy so the catalog chunk is
// split out and fetched on open. The import() is guarded by the raw build
// defines (NOT the DEV_TOOLS const): esbuild folds `false || false` during
// transform and drops the import(), so the chunk is never emitted in a
// production build. The const does not inline far enough to eliminate a
// dynamic import, so it must stay as the literal defines here.
const StorybookModal = (import.meta.env.DEV || __DEV_TOOLS__)
  ? lazy(() =>
      import('../../storybook/StorybookModal').then(m => ({ default: m.StorybookModal })),
    )
  : null;
import { PanelSimulatorCard } from './SimulatorsCard';
import { FontDebugCard } from './FontDebugCard';
import { AppTelemetryCard } from './AppTelemetryCard';
import { HelloGreetingCard } from './HelloGreetingCard';
import { DevSimEventsCard } from './DevSimEventsCard';
import { AstralSimCard } from './AstralSimCard';
import { fetchInstallDefaults, fetchInstallDefaultsSnapshot, type InstallDefaultsDocument } from '../../api/installDefaults';
import { DeviceModal } from '../common/DeviceModal/DeviceModal';
import { DEV_TOOLS } from '../../lib/devTools';
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
 * Internal Debug Tools page, reached from the top-bar "..." menu. The top bar
 * supplies the page heading, so this view starts straight at the card grid.
 * Cards here are diagnostics + developer utilities only.
 */
export function ToolsView({ serviceOnline, connectionState }: ToolsViewProps) {
  if (!serviceOnline) {
    return (
      <div className={styles.page}>
        <div className={`${styles.scroller} pageBody`}>
          <div className={styles.tools}>
            <ServiceRequired page="nexus" state={connectionState} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.scroller} pageBody`}>
        <div className={styles.tools}>
          <div className={styles.grid}>
            <StorybookCard />
            <WidgetSdkCard />
            <TelemetryEventsCard />
            {DEV_TOOLS && <AppTelemetryCard />}
            <InstallDefaultsCard />
            <PawnIoCard />
            <PanelSimulatorCard />
            {DEV_TOOLS && <DevSimEventsCard />}
            {DEV_TOOLS && <AstralSimCard />}
            <FontDebugCard />
            <HelloGreetingCard />
          </div>
        </div>
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
      {open && StorybookModal && (
        <Suspense fallback={null}>
          <StorybookModal open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </Card>
  );
}

/**
 * Widget SDK reference card. Opens the storybook-style /widget-reference
 * page in a new tab - every meter tag, binding function, data source type,
 * and dispatch action with live previews.
 */
function WidgetSdkCard() {
  const { t } = useTranslation();
  return (
    <Card title={t('tools.widgetSdk.title')}>
      <span className={styles.dim}>{t('tools.widgetSdk.label')}</span>
      <Button tone="accent" size="sm" onClick={() => {
        window.open('/widget-reference', '_blank', 'noopener,noreferrer');
      }}>{t('tools.openReference')}</Button>
    </Card>
  );
}

/**
 * Telemetry events reference card. Opens /telemetry-reference - every product
 * event sent to PostHog, what it means, when it fires, and its parameters.
 */
function TelemetryEventsCard() {
  const { t } = useTranslation();
  return (
    <Card title={t('tools.telemetryEvents.title')}>
      <span className={styles.dim}>{t('tools.telemetryEvents.label')}</span>
      <Button tone="accent" size="sm" onClick={() => {
        window.open('/telemetry-reference', '_blank', 'noopener,noreferrer');
      }}>{t('tools.openReference')}</Button>
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card title={t('tools.installDefaults.title')}>
      <span className={styles.dim}>
        {t('tools.installDefaults.cardIntro')}{' '}
        {/* eslint-disable-next-line i18next/no-literal-string -- service config file path */}
        <code>nexus-service/data/install-defaults.json</code>{' '}
        {t('tools.installDefaults.cardOutro')}
      </span>
      <Button tone="accent" size="sm" onClick={() => setOpen(true)}>{t('tools.installDefaults.openSnapshot')}</Button>
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
  const { t } = useTranslation();
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
    <DeviceModal open={open} onClose={onClose} wide title={t('tools.installDefaults.title')}>
      <div className={styles.installDefaultsModal}>
        <p className={styles.dim}>
          {t('tools.installDefaults.modalIntro')}
          {/* eslint-disable-next-line i18next/no-literal-string -- service config file path */}
          <code> nexus-service/data/install-defaults.json</code>{' '}
          {t('tools.installDefaults.modalOutro')}
        </p>
        <div className={styles.installDefaultsTabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'current'}
            className={`${styles.installDefaultsTab} ${tab === 'current' ? styles.installDefaultsTabActive : ''}`}
            onClick={() => setTab('current')}>{t('tools.installDefaults.tabCurrent')}</button>
          <button type="button" role="tab" aria-selected={tab === 'defaults'}
            className={`${styles.installDefaultsTab} ${tab === 'defaults' ? styles.installDefaultsTabActive : ''}`}
            onClick={() => setTab('defaults')}>{t('tools.installDefaults.tabDefaults')}</button>
        </div>
        {!doc ? (
          <p className={styles.dim}>{t('tools.installDefaults.loading')}</p>
        ) : (
          <InstallDefaultsTabBody doc={doc} tab={tab} />
        )}
      </div>
    </DeviceModal>
  );
}

function InstallDefaultsTabBody({ doc, tab }: { doc: InstallDefaultsDocument; tab: 'current' | 'defaults' }) {
  const { t } = useTranslation();
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
          {copied === copyAllId
            ? t('builder.copied')
            : t('tools.installDefaults.copyEntire', {
                kind: tab === 'current'
                  ? t('tools.installDefaults.kindSnapshot')
                  : t('tools.installDefaults.kindDefaults'),
              })}
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
                    {copied === id ? t('builder.copied') : t('devices.specs.copy')}
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

