// Storybook-style reference for the declarative widget SDK. Routed at
// /widget-reference and surfaced from the Debug Tools menu. The tabs
// enumerate every public surface — meters, bindings, data sources,
// capabilities, dispatch actions, manifest schema — so an internal
// reviewer or a third-party widget author can navigate the whole SDK
// without reading source.

import { useMemo, useState } from 'react';
import { renderView } from '../declarative/renderer';
import type { WidgetView } from '../types';
import {
  STORIES, SAMPLE_CONTEXT, BINDINGS_CHEATSHEET, DATA_SOURCES_CHEATSHEET,
  CAPABILITIES_CHEATSHEET, DISPATCH_ACTIONS_CHEATSHEET, MANIFEST_CHEATSHEET,
  type WidgetReferenceStory,
} from './stories';
import styles from './WidgetReference.module.scss';

type Tab = 'meters' | 'bindings' | 'data' | 'capabilities' | 'dispatch' | 'manifest';

export function WidgetReferenceWrapper() {
  const [tab, setTab] = useState<Tab>('meters');
  const [activeTag, setActiveTag] = useState<string>(STORIES[0]?.tag ?? '');

  const grouped = useMemo(() => {
    const m: Record<WidgetReferenceStory['category'], WidgetReferenceStory[]> = {
      layout: [], text: [], iconography: [], indicators: [], logic: [], interactive: [],
    };
    for (const s of STORIES) m[s.category].push(s);
    return m;
  }, []);

  const active = useMemo(() => STORIES.find((s) => s.tag === activeTag) ?? STORIES[0], [activeTag]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'meters',       label: 'Meters' },
    { key: 'bindings',     label: 'Bindings' },
    { key: 'data',         label: 'Data sources' },
    { key: 'capabilities', label: 'Capabilities' },
    { key: 'dispatch',     label: 'Dispatch' },
    { key: 'manifest',     label: 'Manifest' },
  ];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <header className={styles.brand}>
          <span className={styles.brandLabel}>Nexus Widget SDK</span>
          <span className={styles.brandSub}>declarative reference</span>
        </header>
        <nav className={styles.tabsScroll}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? styles.tabActive : styles.tab}
              onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
        </nav>
        {tab === 'meters' && (
          <div className={styles.nav}>
            {(Object.keys(grouped) as Array<keyof typeof grouped>).map((cat) => (
              grouped[cat].length === 0 ? null : (
                <section key={cat} className={styles.navSection}>
                  <h4 className={styles.navHeading}>{cat}</h4>
                  <ul className={styles.navList}>
                    {grouped[cat].map((s) => (
                      <li key={s.tag}>
                        <button
                          type="button"
                          className={s.tag === activeTag ? styles.navItemActive : styles.navItem}
                          onClick={() => setActiveTag(s.tag)}
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            ))}
          </div>
        )}
      </aside>
      <main className={styles.canvas}>
        {tab === 'meters' && active && <MeterDoc story={active} />}
        {tab === 'bindings' && <BindingsDoc />}
        {tab === 'data' && <DataSourcesDoc />}
        {tab === 'capabilities' && <CapabilitiesDoc />}
        {tab === 'dispatch' && <DispatchDoc />}
        {tab === 'manifest' && <ManifestDoc />}
      </main>
    </div>
  );
}

function MeterDoc({ story }: { story: WidgetReferenceStory }) {
  return (
    <div className={styles.doc}>
      <header className={styles.docHeader}>
        <div className={styles.tagPill}>{story.tag}</div>
        <h1 className={styles.docTitle}>{story.title}</h1>
        <p className={styles.docDesc}>{story.description}</p>
      </header>

      <section>
        <h2 className={styles.sectionHeading}>Props</h2>
        <div className={styles.propsTable}>
          <div className={styles.propsHead}>
            <span>name</span><span>type</span><span>description</span>
          </div>
          {story.props.map((p) => (
            <div key={p.name} className={styles.propsRow}>
              <span className={styles.propName}>
                {p.name}
                {p.required && <span className={styles.required}>*</span>}
              </span>
              <span className={styles.propType}>{p.type}</span>
              <span className={styles.propDoc}>{p.doc}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className={styles.sectionHeading}>Variants</h2>
        {story.variants.length === 0 && (
          <p className={styles.empty}>No live variants — see consuming widgets for usage.</p>
        )}
        {story.variants.map((v, i) => (
          <article key={i} className={styles.variant}>
            <header className={styles.variantHeader}>{v.name}</header>
            <div className={styles.variantBody}>
              <div className={styles.preview} style={{
                width: v.size?.width ?? 'min(100%, 280px)',
                height: v.size?.height ?? 140,
              }}>
                {renderView(v.view as WidgetView, {
                  data: SAMPLE_CONTEXT.data as Record<string, unknown>,
                  settings: SAMPLE_CONTEXT.settings as Record<string, unknown>,
                  size: { width: v.size?.width ?? 280, height: v.size?.height ?? 140 },
                  widgetId: 'reference',
                })}
              </div>
              <pre className={styles.code}>{JSON.stringify(v.view, null, 2)}</pre>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function BindingsDoc() {
  return (
    <div className={styles.doc}>
      <header className={styles.docHeader}>
        <div className={styles.tagPill}>{'{...}'}</div>
        <h1 className={styles.docTitle}>Binding language</h1>
        <p className={styles.docDesc}>
          String values in any prop can contain <code>{'{expression}'}</code> templates.
          Expressions are pure: no side effects, no statements, no loops. The full grammar
          is in <code>nexus-web/src/widgets/declarative/bindings.ts</code>.
        </p>
      </header>

      <section>
        <h2 className={styles.sectionHeading}>Scope</h2>
        <DocList items={BINDINGS_CHEATSHEET.scope.map((s) => ({ key: s.name, value: s.doc }))} />
      </section>
      <section>
        <h2 className={styles.sectionHeading}>Operators</h2>
        <DocList items={BINDINGS_CHEATSHEET.operators.map((o) => ({ key: o.sig, value: o.doc }))} />
      </section>
      <section>
        <h2 className={styles.sectionHeading}>Functions</h2>
        <DocList items={BINDINGS_CHEATSHEET.functions.map((f) => ({ key: f.sig, value: f.doc }))} />
      </section>
      <section>
        <h2 className={styles.sectionHeading}>Colour tokens</h2>
        <DocList items={BINDINGS_CHEATSHEET.colors.map((c) => ({ key: c.name, value: c.doc }))} />
      </section>
    </div>
  );
}

function DataSourcesDoc() {
  return (
    <div className={styles.doc}>
      <header className={styles.docHeader}>
        <div className={styles.tagPill}>data</div>
        <h1 className={styles.docTitle}>Data sources</h1>
        <p className={styles.docDesc}>
          The <code>manifest.data</code> map declares where the renderer's
          <code> {'{data.*}'} </code> bindings get their values. Each key is one of these shapes.
          String fields inside a source spec themselves support bindings, so settings can pick which
          sensor / endpoint / action a slot reads — see the Monitoring widget for the pattern.
        </p>
      </header>
      {DATA_SOURCES_CHEATSHEET.map((d) => (
        <article key={d.name} className={styles.variant}>
          <header className={styles.variantHeader}>{d.name}</header>
          <pre className={styles.code}>{d.shape}</pre>
          <p className={styles.docDesc} style={{ marginTop: 8 }}>{d.doc}</p>
        </article>
      ))}
    </div>
  );
}

function CapabilitiesDoc() {
  return (
    <div className={styles.doc}>
      <header className={styles.docHeader}>
        <div className={styles.tagPill}>caps</div>
        <h1 className={styles.docTitle}>Capabilities</h1>
        <p className={styles.docDesc}>
          The <code>manifest.capabilities</code> block is the security perimeter — the host
          allows the widget to read sensors / fetch URLs / call host actions only when they're
          declared here. Install-time consent (planned) will show this block verbatim before
          the user clicks Install.
        </p>
      </header>
      <DocList items={CAPABILITIES_CHEATSHEET.map((c) => ({
        key: `${c.name}  (${c.type})`,
        value: c.doc,
      }))} />
    </div>
  );
}

function DispatchDoc() {
  return (
    <div className={styles.doc}>
      <header className={styles.docHeader}>
        <div className={styles.tagPill}>dispatch</div>
        <h1 className={styles.docTitle}>Registered host actions</h1>
        <p className={styles.docDesc}>
          Widgets POST <code>{'{ widgetId, action, args }'}</code> to <code>/widgets-api/dispatch</code>.
          The host validates <code>action</code> against the widget's
          <code> capabilities.dispatch </code> allowlist, then routes to a registered handler.
          Slider <code>onCommit</code>, the <code>host</code> data source, and any future
          <code> nexus.dispatch()</code> worker call all flow through here.
        </p>
      </header>
      {DISPATCH_ACTIONS_CHEATSHEET.map((a) => (
        <article key={a.name} className={styles.variant}>
          <header className={styles.variantHeader}>{a.name}</header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div className={styles.sectionHeading} style={{ marginBottom: 4 }}>args</div>
              <pre className={styles.code} style={{ margin: 0 }}>{a.args}</pre>
            </div>
            <div>
              <div className={styles.sectionHeading} style={{ marginBottom: 4 }}>returns</div>
              <pre className={styles.code} style={{ margin: 0 }}>{a.returns}</pre>
            </div>
            <p className={styles.docDesc} style={{ margin: 0 }}>{a.doc}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ManifestDoc() {
  return (
    <div className={styles.doc}>
      <header className={styles.docHeader}>
        <div className={styles.tagPill}>manifest.json</div>
        <h1 className={styles.docTitle}>Manifest schema</h1>
        <p className={styles.docDesc}>
          Each widget ships a <code>manifest.json</code> at the bundle root. The host loads
          it on install and validates against <code>nexus.widget/2</code>. Top-level keys:
        </p>
      </header>
      <DocList items={MANIFEST_CHEATSHEET.map((m) => ({ key: m.key, value: m.doc }))} />
    </div>
  );
}

function DocList({ items }: { items: Array<{ key: string; value: string }> }) {
  return (
    <ul className={styles.docList}>
      {items.map((it) => (
        <li key={it.key}>
          <code className={styles.docKey}>{it.key}</code>
          <span className={styles.docValue}>{it.value}</span>
        </li>
      ))}
    </ul>
  );
}
