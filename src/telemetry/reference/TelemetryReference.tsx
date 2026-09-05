// Docs-style reference for product telemetry, routed at /telemetry-reference
// (Settings → Dev tools → Telemetry events). Lists every event the app emits
// to PostHog, what it means, when it fires, and its parameters - an API
// lookup in the form of docs. Catalog lives in ./events.ts.

import { useMemo, useState } from 'react';
import {
  TELEMETRY_EVENTS,
  AUTO_PROPERTIES,
  PERSON_PROPERTIES,
  type TelemetryEventDoc,
  type TelemetryParam,
} from './events';
import styles from './TelemetryReference.module.scss';

export function TelemetryReference() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TELEMETRY_EVENTS;
    return TELEMETRY_EVENTS.filter(
      e =>
        e.name.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.params.some(p => p.name.toLowerCase().includes(q)),
    );
  }, [query]);

  const liveCount = TELEMETRY_EVENTS.filter(e => e.status === 'live').length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Telemetry events</h1>
        <p className={styles.sub}>
          Every product-analytics event the app sends to PostHog. {liveCount} live,{' '}
          {TELEMETRY_EVENTS.length - liveCount} planned. Events are anonymous (no PII) and
          gated by the “collect anonymous data” setting.
        </p>
        <input
          className={styles.search}
          type="text"
          placeholder="Filter events…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </header>

      <section className={styles.autoProps}>
        <h2>Automatic properties</h2>
        <p className={styles.dim}>Attached to every event - you never pass these yourself.</p>
        <ParamTable params={AUTO_PROPERTIES} />
      </section>

      <section className={styles.autoProps}>
        <h2>Person properties</h2>
        <p className={styles.dim}>
          Attached to the anonymous install, not to any single event, and refreshed only when a
          value changes. This is what lets every event below be broken down by hardware. Counts and
          enum values only - no user-authored text (widget titles, renamed devices, panel names)
          ever leaves the machine.
        </p>
        <ParamTable params={PERSON_PROPERTIES} />
      </section>

      <div className={styles.list}>
        {filtered.map(event => (
          <EventCard key={event.name} event={event} />
        ))}
        {filtered.length === 0 && <p className={styles.empty}>No events match “{query}”.</p>}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: TelemetryEventDoc }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <code className={styles.name}>{event.name}</code>
        <span className={`${styles.badge} ${styles[event.status]}`}>{event.status}</span>
        <span className={styles.source}>{event.source}</span>
      </div>
      <p className={styles.desc}>{event.description}</p>
      {event.params.length > 0 ? (
        <ParamTable params={event.params} />
      ) : (
        <p className={styles.dim}>No parameters.</p>
      )}
    </article>
  );
}

function ParamTable({ params }: { params: TelemetryParam[] }) {
  return (
    <table className={styles.params}>
      <thead>
        <tr>
          <th>Param</th>
          <th>Type</th>
          <th>Required</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {params.map(p => (
          <tr key={p.name}>
            <td><code>{p.name}</code></td>
            <td className={styles.type}>{p.type}</td>
            <td>{p.required ? 'yes' : 'no'}</td>
            <td>{p.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
