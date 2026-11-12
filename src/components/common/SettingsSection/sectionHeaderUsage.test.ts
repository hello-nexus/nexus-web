// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// A titled box belongs to SettingsSection, which owns the gap below it. Bare
// SectionHeader is for headings that sit outside the title-plus-box pattern
// (page rails, columns, diagnostics cards). This ratchet lists the files that
// use it today; a new file hand-rolling a section title fails here. Move the
// markup to SettingsSection, or add the file below with a reason in review.
const ALLOWED = new Set([
  'app/public/PublicProfileBenchmarks.tsx',
  'components/common/ImportCenter/ImportCenter.tsx',
  'components/common/SettingsSection/SettingsSection.tsx',
  'components/views/DiagnosticsView/CoolingHistorySection.tsx',
  'components/views/DiagnosticsView/CoolingSection.tsx',
  'components/views/DiagnosticsView/IncidentCounts.tsx',
  'components/views/DiagnosticsView/IncidentsSection.tsx',
  'components/views/DiagnosticsView/ThermalsTab.tsx',
  'components/views/DiagnosticsView/StorageSection.tsx',
  'components/views/DiagnosticsView/SystemSection.tsx',
  'panel/widgets/benchmark/BenchmarkEntryDetail.tsx',
  'panel/widgets/benchmark/BenchmarkPage.tsx',
  'panel/widgets/deck/DeckKeyInspector.tsx',
  'panel/widgets/devices/DevicesPage.tsx',
  'panel/widgets/frames/FramesPage.tsx',
  'panel/widgets/gallery/page/GalleryPage.tsx',
  'panel/widgets/home-assistant/HomeAssistantDashboard.tsx',
  'panel/widgets/lighting/LightingPage.tsx',
  'panel/widgets/smart-lights/SmartLightsPage.tsx',
  'panel/widgets/weather/WeatherDailyList.tsx',
  'panel/widgets/weather/WeatherHourlyStrip.tsx',
  'panel/widgets/weather/WeatherLocationList.tsx',
  'panel/widgets/weather/WeatherPage.tsx',
  'storybook/registry.tsx',
]);

const SRC = join(__dirname, '..', '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return name.endsWith('.tsx') && !name.includes('.test.') ? [p] : [];
  });
}

describe('SectionHeader usage', () => {
  const users = tsxFiles(SRC)
    .filter((f) => /<SectionHeader\b/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(SRC, f).split('\\').join('/'));

  it('is confined to the allowlisted files', () => {
    expect(users.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    expect([...ALLOWED].filter((f) => !users.includes(f))).toEqual([]);
  });
});
