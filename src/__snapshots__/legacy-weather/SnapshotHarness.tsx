// Snapshot harness for visual-parity work on the weather widget. The legacy
// WeatherWidget was retired and replaced by the bundled marketplace widget
// `com.nexusqos.weather`; this harness keeps a frozen copy of the original
// alongside the declarative version so we can keep iterating on the manifest
// without diverging from the legacy look.
//
// Reached at: /snapshot-harness. Each `data-snap=...` cell renders both
// columns at 2x2 / 4x2 / 4x4 against an identical mocked payload so a
// Playwright snapshot captures pixel parity.
//
// Cell size is fixed at 110px (close to a typical desktop dashboard cell).

import { WeatherWidget as LegacyWeatherWidget } from './LegacyWeatherWidget';
import { renderView } from '../../widgets/declarative/renderer';
import weatherManifest from './weatherManifest.json';

const SIZES: Array<{ label: '2x2' | '4x2' | '4x4'; cols: number; rows: number }> = [
  { label: '2x2', cols: 2, rows: 2 },
  { label: '4x2', cols: 4, rows: 2 },
  { label: '4x4', cols: 4, rows: 4 },
];
const CELL = 110;

const MOCK_SNAP = {
  temperatureC: 23,
  temperatureF: 73,
  weatherCode: 2,
  condition: 'Partly cloudy',
  humidityPct: 52,
  windKph: 12,
  locationLabel: 'New York',
  countryCode: 'US',
  asOf: new Date('2026-05-13T15:00:00Z').toISOString(),
  hourly: Array.from({ length: 6 }, (_, i) => ({
    time: new Date(Date.parse('2026-05-13T15:00:00Z') + i * 3600_000).toISOString(),
    weatherCode: [2, 2, 61, 3, 3, 3][i],
    temperatureC: [23, 23, 22, 21, 20, 19][i],
    temperatureF: [73, 73, 72, 70, 68, 66][i],
  })),
  daily: Array.from({ length: 5 }, (_, i) => ({
    date: new Date(Date.parse('2026-05-13T00:00:00Z') + i * 86400_000).toISOString().slice(0, 10),
    weatherCode: [2, 0, 61, 3, 0][i],
    temperatureMinC: [18, 19, 17, 16, 18][i],
    temperatureMaxC: [25, 28, 24, 22, 27][i],
    temperatureMinF: Math.round([18, 19, 17, 16, 18][i] * 9 / 5 + 32),
    temperatureMaxF: Math.round([25, 28, 24, 22, 27][i] * 9 / 5 + 32),
  })),
};

const DECLARATIVE_PAYLOAD = {
  current: {
    temp: 23, tempLabel: '23°', unitSymbol: '°C', condition: 'Partly cloudy', icon: 'cloud-sun',
    humidity: 52, humidityLabel: '52%', windKph: 12, windLabel: '12',
    hiLoLabel: 'H:25° L:18°', label: 'New York',
    asOf: Date.parse('2026-05-13T15:00:00Z'), relTime: '0s ago', hasData: true,
  },
  hourly: [
    { hourLabel: '3PM', icon: 'cloud-sun',  temp: 23, tempLabel: '23°' },
    { hourLabel: '4PM', icon: 'cloud-sun',  temp: 23, tempLabel: '23°' },
    { hourLabel: '5PM', icon: 'cloud-rain', temp: 22, tempLabel: '22°' },
    { hourLabel: '6PM', icon: 'cloud',      temp: 21, tempLabel: '21°' },
    { hourLabel: '7PM', icon: 'cloud',      temp: 20, tempLabel: '20°' },
    { hourLabel: '8PM', icon: 'cloud',      temp: 19, tempLabel: '19°' },
  ],
  daily: [
    { dayLabel: 'Today', icon: 'cloud-sun',  lo: 18, hi: 25, loLabel: '18°', hiLabel: '25°' },
    { dayLabel: 'Thu',   icon: 'sun',        lo: 19, hi: 28, loLabel: '19°', hiLabel: '28°' },
    { dayLabel: 'Fri',   icon: 'cloud-rain', lo: 17, hi: 24, loLabel: '17°', hiLabel: '24°' },
    { dayLabel: 'Sat',   icon: 'cloud',      lo: 16, hi: 22, loLabel: '16°', hiLabel: '22°' },
    { dayLabel: 'Sun',   icon: 'sun',        lo: 18, hi: 27, loLabel: '18°', hiLabel: '27°' },
  ],
  weekMin: 16, weekMax: 28,
};

const SETTINGS = { showCondition: true, showLocation: true, showDetails: true, units: 'celsius', label: 'New York' };

export function SnapshotHarness() {
  // The renderer requests widget assets at /widgets-api/installed/<id>/asset/...
  // The harness runs against the static vite preview server with no nexus-service
  // backing, so we route those requests to the public/snapshot-assets/ tree
  // where each widget's bundled SVG / image lives.
  installHarnessAssetRedirect();

  return (
    <div style={{
      minHeight: '100vh', background: '#0f0f0f', color: '#f5f5f5',
      fontFamily: 'system-ui, sans-serif', padding: 24,
      ['--text' as never]: '#f5f5f5',
      ['--text-dim' as never]: 'rgba(245, 245, 245, 0.6)',
      ['--text-faded' as never]: 'rgba(245, 245, 245, 0.4)',
      ['--accent' as never]: '#8b5cf6',
      ['--accent-glow' as never]: '#a78bfa',
      ['--accent-deep' as never]: '#7c3aed',
      ['--good' as never]: '#10b981',
      ['--warn' as never]: '#f59e0b',
      ['--bad' as never]: '#ef4444',
      ['--border' as never]: 'rgba(255, 255, 255, 0.12)',
      ['--bg-card' as never]: '#212121',
      ['--panel-text' as never]: '#f5f5f5',
      ['--panel-text-muted' as never]: 'rgba(245, 245, 245, 0.6)',
      ['--panel-accent-glow' as never]: '#a78bfa',
      ['--panel-accent-shadow' as never]: 'rgba(167, 139, 250, 0.45)',
      ['--panel-border' as never]: 'rgba(255, 255, 255, 0.12)',
      ['--radius-pill' as never]: '999px',
    } as React.CSSProperties}>
      <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Snapshot harness — weather</h1>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
        Cell {CELL}px. Each row: legacy (left) vs declarative (right). Playwright shoots <code>data-snap='&lt;variant&gt;-&lt;size&gt;'</code>.
      </p>
      <WeatherHarness />
    </div>
  );
}

function WeatherHarness() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 24 }}>
      {SIZES.map((sz) => {
        const w = sz.cols * CELL;
        const h = sz.rows * CELL;
        const view = (weatherManifest as { view: Record<string, unknown> }).view[sz.label];
        return (
          <section key={sz.label}>
            <header style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
              opacity: 0.55, marginBottom: 8,
            }}>{sz.label} ({w}×{h}px)</header>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <figure style={{ margin: 0 }}>
                <figcaption style={{ fontSize: 10, opacity: 0.45, marginBottom: 4 }}>legacy</figcaption>
                <div
                  data-snap={`legacy-${sz.label}`}
                  style={cellStyle(w, h)}
                >
                  <LegacyWeatherWidget
                    widget={{ id: 'snap', type: 'weather', size: sz.label, col: 0, row: 0, config: {} } as never}
                    mockSnap={MOCK_SNAP as never}
                    fixedNow={Date.parse('2026-05-13T15:00:00Z')}
                  />
                </div>
              </figure>
              <figure style={{ margin: 0 }}>
                <figcaption style={{ fontSize: 10, opacity: 0.45, marginBottom: 4 }}>declarative</figcaption>
                <div
                  data-snap={`declarative-${sz.label}`}
                  style={cellStyle(w, h)}
                >
                  <div style={declarativeWrapStyle}>
                    {renderView(view as never, {
                      data: { weather: DECLARATIVE_PAYLOAD },
                      settings: SETTINGS,
                      size: { width: w, height: h },
                      widgetId: 'com.nexusqos.weather',
                    })}
                  </div>
                </div>
              </figure>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const cellStyle = (w: number, h: number): React.CSSProperties => ({
  width: w, height: h,
  background: '#212121', border: '1px solid #303030', borderRadius: 12,
  overflow: 'hidden', boxSizing: 'border-box',
});

const declarativeWrapStyle: React.CSSProperties = {
  width: '100%', height: '100%', minWidth: 0, minHeight: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
  color: 'var(--panel-text, var(--text, currentColor))',
  containerType: 'size',
};

let harnessFetchInstalled = false;
function installHarnessAssetRedirect() {
  if (harnessFetchInstalled || typeof window === 'undefined') return;
  harnessFetchInstalled = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = function harnessFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url;
    const m = url.match(/^\/widgets-api\/installed\/([^/]+)\/asset\/(.+)$/);
    if (m) {
      const id = m[1];
      const rest = m[2];
      const redirected = `/snapshot-assets/${id}/${rest}`;
      return realFetch(redirected, init);
    }
    return realFetch(input, init);
  };
}
