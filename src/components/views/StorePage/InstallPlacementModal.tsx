import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, LayoutGrid, Plus, Replace } from 'lucide-react';
import classNames from 'classnames';
import { Overlay } from '../../common/Overlay/Overlay';
import { Button } from '../../common/Button/Button';
import { AppIconTile } from '../../common/AppIconTile/AppIconTile';
import { useToastSafe } from '../../common/Toast/Toast';
import { useTranslation } from '../../../lib/i18n';
import { fetchStoreApp } from '../../../api/store';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { sizeToSpan } from '../../../panel/engine/grid';
import { layoutRowExtent } from '../../../panel/engine/paginate';
import { isSingleWidgetSurface, type PanelWidget } from '../../../panel/types';
import { lookupApp } from '../../../panel/widgets/registry';
import { typeForMarketplace } from '../../../widgets/marketplaceRegistry';
import {
  DASHBOARD_TARGET_KEY, commitPlacement, loadTarget, placementTargets, planPlacement,
  type PlacementPlan,
} from './installPlacement';
import styles from './InstallPlacementModal.module.scss';

// Preview box inside a card's stage, in px.
const STAGE = { width: 216, height: 236 };
// Screens narrower than this get a magnified copy of the new tile beside them.
const LENS_ASPECT = 0.4;
// The magnified tile keeps the tile's own aspect inside this box.
const LENS_BOX = { width: 120, height: 120 };
const ROUND_SURFACES = new Set(['kraken', 'lcd-round']);

function fit(aspect: number, box: { width: number; height: number }) {
  return aspect >= box.width / box.height
    ? { width: box.width, height: box.width / aspect }
    : { width: box.height * aspect, height: box.height };
}

function NewTile({ screenshot, iconSrc, style, className }: {
  screenshot: string | null; iconSrc: string | null; style?: CSSProperties; className?: string;
}) {
  return (
    <span
      className={classNames(styles.newTile, className)}
      style={{ ...style, ...(screenshot ? { backgroundImage: `url("${screenshot}")` } : {}) }}
    >
      {!screenshot && <AppIconTile src={iconSrc} size={28} />}
    </span>
  );
}

function PlacedTile({ widget, cols, rows }: { widget: PanelWidget; cols: number; rows: number }) {
  const span = sizeToSpan(widget.size);
  const Icon = lookupApp(widget.type)?.meta.icon;
  return (
    <span
      className={styles.tile}
      style={{
        left: `${(widget.col / cols) * 100}%`,
        top: `${(widget.row / rows) * 100}%`,
        width: `${(Math.min(span.cols, cols) / cols) * 100}%`,
        height: `${(span.rows / rows) * 100}%`,
      }}
    >
      {Icon && <Icon size={14} />}
    </span>
  );
}

function GridTiles({ plan, cols, rows, screenshot, iconSrc }: {
  plan: PlacementPlan; cols: number; rows: number; screenshot: string | null; iconSrc: string | null;
}) {
  return (
    <>
      {plan.page.widgets.map(widget => (widget.id === plan.widget.id ? (
        <NewTile
          key={widget.id}
          screenshot={screenshot}
          iconSrc={iconSrc}
          className={styles.gridNewTile}
          style={{
            left: `${(widget.col / cols) * 100}%`,
            top: `${(widget.row / rows) * 100}%`,
            width: `${(Math.min(sizeToSpan(widget.size).cols, cols) / cols) * 100}%`,
            height: `${(sizeToSpan(widget.size).rows / rows) * 100}%`,
          }}
        />
      ) : (
        <PlacedTile key={widget.id} widget={widget} cols={cols} rows={rows} />
      )))}
    </>
  );
}

function PlacementPreview({ plan, screenshot, iconSrc }: {
  plan: PlacementPlan; screenshot: string | null; iconSrc: string | null;
}) {
  const cols = Math.max(1, plan.capacity.gridCols);

  if (plan.target.key === DASHBOARD_TARGET_KEY) {
    const rows = Math.max(1, layoutRowExtent({ ...plan.layout, pages: [plan.page] }));
    const box = fit(cols / rows, { width: STAGE.width - 30, height: STAGE.height });
    return (
      <span className={styles.dashboard}>
        <span className={styles.dashboardRail} aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <span className={styles.grid} style={{ width: box.width, height: box.height }}>
          <GridTiles plan={plan} cols={cols} rows={rows} screenshot={screenshot} iconSrc={iconSrc} />
        </span>
      </span>
    );
  }

  const rows = Math.max(1, plan.capacity.pageRows);
  const aspect = plan.screen ? plan.screen.width / plan.screen.height : cols / rows;
  const lens = aspect < LENS_ASPECT;
  const box = fit(aspect, lens ? { width: STAGE.width - LENS_BOX.width, height: STAGE.height } : STAGE);
  const span = sizeToSpan(plan.widget.size);
  const lensSize = fit((span.cols * box.width / cols) / (span.rows * box.height / rows), LENS_BOX);
  const round = ROUND_SURFACES.has(plan.target.surface);
  const single = isSingleWidgetSurface(plan.surface);

  return (
    <>
      <span className={classNames(styles.bezel, { [styles.round]: round })}>
        {single ? (
          <NewTile
            screenshot={screenshot}
            iconSrc={iconSrc}
            className={classNames(styles.screen, { [styles.round]: round })}
            style={{ width: box.width, height: box.height }}
          />
        ) : (
          <span className={classNames(styles.screen, styles.grid)} style={{ width: box.width, height: box.height }}>
            <GridTiles plan={plan} cols={cols} rows={rows} screenshot={screenshot} iconSrc={iconSrc} />
          </span>
        )}
      </span>
      {lens && !single && (
        <NewTile screenshot={screenshot} iconSrc={iconSrc} className={styles.lens} style={lensSize} />
      )}
    </>
  );
}

function TargetIcon({ iconSrc }: { iconSrc: string | null }) {
  if (!iconSrc) return <span className={styles.targetIcon}><LayoutGrid size={22} /></span>;
  return (
    <span className={styles.targetIcon}>
      <span className={styles.deviceGlyph} style={{ ['--device-icon' as string]: `url(${iconSrc})` }} />
    </span>
  );
}

/**
 * After a widget app installs: offer the Apps dashboard and every compatible
 * connected panel, all selected. Renders nothing until the plans load, and
 * closes on its own when nothing can take the widget.
 */
export function InstallPlacementModal({ app, iconSrc, devices, dashboardColumns, onDone }: {
  app: { id: string; name: string };
  iconSrc: string | null;
  devices: readonly UnifiedDevice[];
  dashboardColumns: number;
  onDone: () => void;
}) {
  const { t, language } = useTranslation();
  const { push: pushToast } = useToastSafe();
  const type = typeForMarketplace(app.id);
  const [plans, setPlans] = useState<PlacementPlan[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    let alive = true;
    const meta = lookupApp(type)?.meta;
    if (!meta) {
      onDone();
      return;
    }
    const targets = placementTargets(t('store.place.dashboard'), devices);
    void Promise.all([
      Promise.all(targets.map(async target => {
        const loaded = await loadTarget(target);
        return loaded ? planPlacement(target, loaded, type, meta, dashboardColumns) : null;
      })),
      fetchStoreApp(app.id, { locale: language }),
    ]).then(([planned, detail]) => {
      if (!alive) return;
      const ready = planned.filter((plan): plan is PlacementPlan => plan !== null);
      if (ready.length === 0) {
        onDone();
        return;
      }
      setScreenshot(detail?.screenshots[0] ?? null);
      setSelected(new Set(ready.map(plan => plan.target.key)));
      setPlans(ready);
    }).catch(() => {
      if (alive) onDone();
    });
    return () => { alive = false; };
    // Planned once per open: devices arriving later must not reshuffle the cards under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listFormat = useMemo(() => new Intl.ListFormat(language, { type: 'conjunction' }), [language]);

  if (!plans) return null;

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const skip = () => {
    if (committing) return;
    pushToast({ title: t('store.place.skipped', { name: app.name }) });
    onDone();
  };

  const add = async () => {
    if (committing || selected.size === 0) return;
    setCommitting(true);
    const meta = lookupApp(type)?.meta;
    const chosen = plans.filter(plan => selected.has(plan.target.key));
    // Sequential: the dashboard and every record write broadcast the same layout channel.
    const results: boolean[] = [];
    for (const plan of chosen) {
      results.push(meta ? await commitPlacement(plan.target, type, meta, dashboardColumns) : false);
    }
    const added = chosen.filter((_, i) => results[i]).map(plan => plan.target.name);
    const failed = chosen.filter((_, i) => !results[i]).map(plan => plan.target.name);
    if (added.length > 0) pushToast({ title: t('store.place.added', { name: app.name, places: listFormat.format(added) }) });
    if (failed.length > 0) pushToast({ title: t('store.place.failed', { name: app.name, places: listFormat.format(failed) }) });
    onDone();
  };

  const replacedName = (plan: PlacementPlan) => {
    const meta = plan.replaces ? lookupApp(plan.replaces)?.meta : undefined;
    return meta ? t(meta.i18nKey) : plan.replaces;
  };

  return (
    <Overlay
      open
      onClose={skip}
      variant="dialog"
      ariaLabel={t('store.place.title', { name: app.name })}
      className={styles.modal}
      autoFocus="container"
    >
      <header className={styles.header}>
        <AppIconTile src={iconSrc} size={56} />
        <div>
          <h2 className={styles.title}>{t('store.place.title', { name: app.name })}</h2>
          <p className={styles.subtitle}>{t('store.place.subtitle')}</p>
        </div>
      </header>

      <div className={styles.cards} style={{ ['--card-count' as string]: plans.length }}>
        {plans.map((plan, i) => {
          const on = selected.has(plan.target.key);
          return (
            <button
              key={plan.target.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={classNames(styles.card, { [styles.cardOn]: on })}
              style={{ ['--card-index' as string]: i }}
              onClick={() => toggle(plan.target.key)}
              disabled={committing}
            >
              <span className={styles.check} aria-hidden="true"><Check /></span>
              <span className={styles.stage}>
                <PlacementPreview plan={plan} screenshot={screenshot} iconSrc={iconSrc} />
              </span>
              <span className={styles.foot}>
                <TargetIcon iconSrc={plan.target.iconSrc} />
                <span className={styles.footText}>
                  <span className={styles.name}>{plan.target.name}</span>
                  <span className={styles.detail}>
                    {plan.replaces !== undefined
                      ? <><Replace size={12} aria-hidden="true" />{t('store.place.replaces', { widget: replacedName(plan) ?? '' })}</>
                      : <><Plus size={12} aria-hidden="true" />{t('store.place.nextSpot')}</>}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <footer className={styles.footer}>
        <span className={styles.count}>{t('store.place.selected', { selected: selected.size, total: plans.length })}</span>
        <Button tone="neutral" size="lg" onClick={skip} disabled={committing}>{t('store.place.skip')}</Button>
        <Button
          tone="accent"
          size="lg"
          onClick={() => { void add(); }}
          disabled={selected.size === 0}
          loading={committing}
        >
          {t('store.place.add')}
          {selected.size > 0 && <span className={styles.badge}>{selected.size}</span>}
        </Button>
      </footer>
    </Overlay>
  );
}
