// Story catalogue for the declarative widget UI. Each story names a meter
// tag, gives a short description, and renders one or more variants with
// the manifest JSON shown alongside. This is the source of truth for
// widget authors browsing /widget-reference; new meters / props belong
// here so the change is visible.

import type { WidgetView } from '../types';

export interface WidgetReferenceStory {
  /** Meter tag used in `manifest.view.<size>.type`. */
  tag: string;
  /** Title shown in the navigation list. */
  title: string;
  /** Category — drives the sidebar grouping. */
  category: 'layout' | 'text' | 'iconography' | 'indicators' | 'logic' | 'interactive';
  /** Single-sentence description. */
  description: string;
  /** Documented props. Each appears in the story sidebar. */
  props: Array<{ name: string; type: string; required?: boolean; doc: string }>;
  /** Concrete variants shown in the preview grid. */
  variants: Array<{ name: string; view: WidgetView; size?: { width: number; height: number } }>;
}

const sampleData = {
  cpu: { temperature: { value: 72, formatted: '72°C' }, load: { value: 38 } },
  weather: {
    current: {
      temp: 23, tempLabel: '23°', condition: 'Partly cloudy', icon: 'cloud-sun',
      hiLoLabel: 'H:25° L:18°', humidityLabel: '52%', windLabel: '12',
      hasData: true, label: 'New York', relTime: '2m ago',
    },
    hourly: [
      { hourLabel: '3PM', icon: 'cloud-sun', tempLabel: '23°' },
      { hourLabel: '4PM', icon: 'cloud-sun', tempLabel: '23°' },
      { hourLabel: '5PM', icon: 'cloud-rain', tempLabel: '22°' },
      { hourLabel: '6PM', icon: 'cloud', tempLabel: '21°' },
      { hourLabel: '7PM', icon: 'cloud', tempLabel: '20°' },
      { hourLabel: '8PM', icon: 'cloud', tempLabel: '19°' },
    ],
    daily: [
      { dayLabel: 'Today', icon: 'cloud-sun', lo: 18, hi: 25, loLabel: '18°', hiLabel: '25°' },
      { dayLabel: 'Mon',   icon: 'sun',       lo: 19, hi: 28, loLabel: '19°', hiLabel: '28°' },
      { dayLabel: 'Tue',   icon: 'cloud-rain', lo: 17, hi: 24, loLabel: '17°', hiLabel: '24°' },
      { dayLabel: 'Wed',   icon: 'cloud',     lo: 16, hi: 22, loLabel: '16°', hiLabel: '22°' },
      { dayLabel: 'Thu',   icon: 'sun',       lo: 18, hi: 27, loLabel: '18°', hiLabel: '27°' },
    ],
    weekMin: 16,
    weekMax: 28,
  },
};

const sampleSettings = {
  color: '#ff8800',
  warnTemp: 80,
  criticalTemp: 95,
  showCondition: true,
  showLocation: true,
  showDetails: true,
};

export const SAMPLE_CONTEXT = { data: sampleData, settings: sampleSettings };

export const STORIES: WidgetReferenceStory[] = [
  // ── Layout ─────────────────────────────────────────────────────────────
  {
    tag: 'vstack',
    title: 'vstack',
    category: 'layout',
    description: 'Vertical flex column. Children stack top-to-bottom with shared gap + padding + cross-axis alignment.',
    props: [
      { name: 'children', type: 'view[]', required: true, doc: 'Child meters rendered top-to-bottom.' },
      { name: 'gap', type: 'number', doc: 'Pixel gap between children. Default 6.' },
      { name: 'padding', type: 'number|string', doc: 'Padding inside the container.' },
      { name: 'align', type: 'start|center|end|stretch', doc: 'Cross-axis (horizontal) alignment.' },
      { name: 'justify', type: 'start|center|end|space-between|space-evenly', doc: 'Main-axis distribution.' },
      { name: 'grow', type: 'boolean', doc: 'flex:1 — claims remaining vertical space in the parent.' },
    ],
    variants: [
      {
        name: 'three rows, gap 8, centered',
        view: {
          type: 'vstack', gap: 8, align: 'center',
          children: [
            { type: 'text', text: 'CPU' },
            { type: 'value', text: '{data.cpu.temperature.value}', unit: '°' },
            { type: 'text', text: 'package' },
          ],
        },
      },
    ],
  },
  {
    tag: 'hstack',
    title: 'hstack',
    category: 'layout',
    description: 'Horizontal flex row. Same props as vstack with axes swapped.',
    props: [
      { name: 'children', type: 'view[]', required: true, doc: 'Child meters rendered left-to-right.' },
      { name: 'gap', type: 'number', doc: 'Pixel gap between children.' },
      { name: 'align', type: 'start|center|end|stretch', doc: 'Vertical alignment.' },
      { name: 'justify', type: 'start|center|end|space-between|space-evenly', doc: 'Horizontal distribution.' },
      { name: 'grow', type: 'boolean', doc: 'flex:1 — claims remaining horizontal space.' },
    ],
    variants: [
      {
        name: 'icon + value + label',
        view: {
          type: 'hstack', gap: 10, align: 'center',
          children: [
            { type: 'icon', name: 'cpu', size: 28, color: 'accent' },
            { type: 'value', text: '{data.cpu.temperature.value}', unit: '°', size: 24, align: 'left' },
            { type: 'text', text: 'CPU package', align: 'left' },
          ],
        },
      },
    ],
  },
  {
    tag: 'grid',
    title: 'grid',
    category: 'layout',
    description: 'CSS grid with `columns` equal-width tracks.',
    props: [
      { name: 'columns', type: 'number', required: true, doc: 'Number of equal-width tracks.' },
      { name: 'gap', type: 'number', doc: 'Pixel gap between cells.' },
      { name: 'padding', type: 'number', doc: 'Padding inside the grid container.' },
    ],
    variants: [
      {
        name: '2 columns',
        view: {
          type: 'grid', columns: 2, gap: 10,
          children: [
            { type: 'badge', text: 'temp' }, { type: 'badge', text: 'load' },
            { type: 'text', text: '{data.cpu.temperature.formatted}' },
            { type: 'text', text: '{data.cpu.load.value}%' },
          ],
        },
      },
    ],
  },
  {
    tag: 'frame',
    title: 'frame',
    category: 'layout',
    description: 'Wraps a single child in a bordered, rounded box. Backgrounds + borders accept colour-token strings.',
    props: [
      { name: 'child', type: 'view', required: true, doc: 'Inner view.' },
      { name: 'fill', type: 'colour', doc: 'Background colour. Accepts tokens (accent, bg-card, transparent) or CSS values.' },
      { name: 'border', type: 'colour', doc: 'Border colour. transparent = no border.' },
      { name: 'radius', type: 'number', doc: 'Border radius in px. Default 8.' },
      { name: 'padding', type: 'number', doc: 'Inner padding. Default 8.' },
    ],
    variants: [
      {
        name: 'bordered card',
        view: {
          type: 'frame', fill: 'transparent', border: 'border', radius: 10, padding: 12,
          child: { type: 'value', text: '{data.cpu.temperature.value}', unit: '°', size: 28 },
        },
      },
    ],
  },
  {
    tag: 'box',
    title: 'box',
    category: 'layout',
    description: 'Fixed-dimension slot. Use inside hstack rows when columns need to align across multiple rows (the original WeatherWidget daily list pattern).',
    props: [
      { name: 'child', type: 'view', doc: 'Inner view (or children[]).' },
      { name: 'width', type: 'number', doc: 'Locked pixel width. Container will not shrink below this.' },
      { name: 'height', type: 'number', doc: 'Locked pixel height.' },
      { name: 'align', type: 'start|center|end', doc: 'Cross-axis alignment of the child inside the box.' },
      { name: 'justify', type: 'start|center|end', doc: 'Main-axis alignment of the child.' },
    ],
    variants: [
      {
        name: 'fixed-width icon slot',
        view: {
          type: 'hstack', gap: 9, align: 'center',
          children: [
            { type: 'text', text: 'Mon', width: 42, align: 'left' },
            { type: 'box', width: 22, align: 'center', child: { type: 'icon', name: 'cloud-sun', size: 21, color: 'accent-glow' } },
            { type: 'text', text: '18°', width: 31, align: 'right' },
            { type: 'range', lo: 18, hi: 25, min: 16, max: 28, gradient: ['#38bdf8d2', 'accent-glow', '#fbbf24e6'], height: 5 },
            { type: 'text', text: '25°', width: 31, align: 'left' },
          ],
        },
      },
    ],
  },
  {
    tag: 'divider',
    title: 'divider',
    category: 'layout',
    description: '1px line. Horizontal by default.',
    props: [
      { name: 'orientation', type: 'horizontal|vertical', doc: 'Default horizontal.' },
      { name: 'color', type: 'colour', doc: 'Line colour. Default `border`.' },
    ],
    variants: [
      {
        name: 'horizontal',
        view: {
          type: 'vstack', gap: 6,
          children: [
            { type: 'text', text: 'top' },
            { type: 'divider' },
            { type: 'text', text: 'bottom' },
          ],
        },
      },
    ],
  },
  {
    tag: 'spacer',
    title: 'spacer',
    category: 'layout',
    description: 'Either a flex spring (no size → flex:1) or a fixed gap.',
    props: [
      { name: 'size', type: 'number', doc: 'If provided, render a fixed pixel block. Omit for flex:1.' },
    ],
    variants: [
      {
        name: 'spring between left and right',
        view: {
          type: 'hstack', align: 'center',
          children: [
            { type: 'text', text: 'left' },
            { type: 'spacer' },
            { type: 'text', text: 'right' },
          ],
        },
      },
    ],
  },
  {
    tag: 'conditional',
    title: 'conditional',
    category: 'logic',
    description: 'Renders `then` when `when` is truthy, else `else`. Supports expression bindings.',
    props: [
      { name: 'when', type: 'expression', required: true, doc: 'Truthy condition. Supports {path}, comparisons, &&, ||, if().' },
      { name: 'then', type: 'view', required: true, doc: 'Rendered on truthy.' },
      { name: 'else', type: 'view', doc: 'Rendered on falsy. Optional.' },
    ],
    variants: [
      {
        name: 'badge swap',
        view: {
          type: 'conditional',
          when: 'data.cpu.temperature.value > 60',
          then: { type: 'badge', text: 'warm', color: 'warn' },
          else: { type: 'badge', text: 'cool', color: 'good' },
        },
      },
    ],
  },
  {
    tag: 'repeat',
    title: 'repeat',
    category: 'logic',
    description: 'Renders the `template` once per item in `in`. Inside the template, `{data.item.*}` resolves against the current entry and `{data.index}` is the 0-based index.',
    props: [
      { name: 'in', type: 'expression → array', required: true, doc: 'Array binding. Non-arrays render `empty`.' },
      { name: 'template', type: 'view', required: true, doc: 'Per-item view. `{data.item.x}` and `{data.index}` available.' },
      { name: 'empty', type: 'view', doc: 'Rendered when the array is empty or missing.' },
      { name: 'limit', type: 'number', doc: 'Slice cap on the array.' },
      { name: 'direction', type: 'horizontal|vertical', doc: 'Default horizontal.' },
      { name: 'gap', type: 'number', doc: 'Gap between items.' },
      { name: 'justify', type: 'space-between|space-evenly|...', doc: 'Distribution along the main axis.' },
      { name: 'grow', type: 'boolean', doc: 'Container takes flex:1 so items fill available space (space-evenly distribution).' },
    ],
    variants: [
      {
        name: 'hourly strip (6 items, horizontal)',
        view: {
          type: 'repeat', in: '{data.weather.hourly}', limit: 6, direction: 'horizontal',
          gap: 3, justify: 'space-between',
          template: {
            type: 'vstack', gap: 5, align: 'center',
            children: [
              { type: 'text', text: '{data.item.hourLabel}', size: 11, transform: 'none', opacity: 0.48 },
              { type: 'icon', name: '{data.item.icon}', size: 22, color: 'accent-glow' },
              { type: 'text', text: '{data.item.tempLabel}', size: 11, transform: 'none' },
            ],
          },
        },
        size: { width: 360, height: 80 },
      },
      {
        name: 'empty fallback',
        view: {
          type: 'repeat', in: '{data.weather.missingList}',
          template: { type: 'text', text: '{data.item.x}' },
          empty: { type: 'text', text: 'no data' },
        },
      },
    ],
  },
  // ── Text ───────────────────────────────────────────────────────────────
  {
    tag: 'text',
    title: 'text',
    category: 'text',
    description: 'Body text. Default style is uppercase 11–13px label. Bindings + interpolation supported.',
    props: [
      { name: 'text', type: 'string', required: true, doc: 'Content. {path} bindings interpolate.' },
      { name: 'size', type: 'number|string', doc: 'Font-size. Number = pixels; string = any CSS value (`"2.6em"`, `"clamp(20px,14cqi,64px)"`) for em-based sizing that scales with the panel cell.' },
      { name: 'weight', type: 'thin|light|regular|medium|semibold|bold|black|number', doc: 'Font weight.' },
      { name: 'align', type: 'left|center|right', doc: 'Text alignment.' },
      { name: 'color', type: 'colour', doc: 'Text colour token or CSS value.' },
      { name: 'width', type: 'number', doc: 'Fixed pixel width. Use for grid-row column alignment.' },
      { name: 'opacity', type: 'number', doc: '0–1. Overrides the default token opacity.' },
      { name: 'transform', type: 'none|uppercase|lowercase|capitalize', doc: 'CSS text-transform. Default is the meter\'s token.' },
      { name: 'tabular', type: 'boolean', doc: 'Enable `font-variant-numeric: tabular-nums` so digits share a fixed advance width (countdowns, clocks, scoreboards).' },
      { name: 'truncate', type: 'boolean', doc: 'Single-line + ellipsis when overflowing.' },
    ],
    variants: [
      {
        name: 'plain label',
        view: { type: 'text', text: 'CPU package' },
      },
      {
        name: 'binding interpolation',
        view: { type: 'text', text: 'temp is {data.cpu.temperature.formatted}', transform: 'none' },
      },
      {
        name: 'fixed-width right-aligned numeric',
        view: { type: 'text', text: '25°', size: 12, align: 'right', width: 31, transform: 'none', opacity: 0.45 },
      },
    ],
  },
  {
    tag: 'value',
    title: 'value',
    category: 'text',
    description: 'Headline display number with optional small unit suffix. Defaults: container-query scaled font-size, tabular digits, tight letter-spacing.',
    props: [
      { name: 'text', type: 'string', required: true, doc: 'Main number string (typically pre-formatted by the worker).' },
      { name: 'unit', type: 'string', doc: 'Small superscript-style suffix. e.g. "°" or "%". Omit if you embedded the unit in `text`.' },
      { name: 'size', type: 'number|string', doc: 'Font-size. Number = pixels; string = any CSS value (`"2.6em"`, `"clamp(...)"`).' },
      { name: 'weight', type: 'thin|...|bold', doc: 'Font weight. Default 600.' },
      { name: 'align', type: 'left|center|right', doc: 'Text alignment. Default center.' },
      { name: 'width', type: 'number', doc: 'Locked container width for column alignment.' },
      { name: 'tabular', type: 'boolean', doc: 'Tabular digits. Default true via the meter\'s baseline style — pass `tabular: false` only if you need proportional digits.' },
    ],
    variants: [
      {
        name: 'large hero value',
        view: { type: 'value', text: '23°', size: 50, align: 'left', weight: 'bold' },
      },
      {
        name: 'value + unit',
        view: { type: 'value', text: '{data.cpu.temperature.value}', unit: '°', size: 28 },
      },
    ],
  },
  {
    tag: 'badge',
    title: 'badge',
    category: 'text',
    description: 'Rounded pill with tinted background. Use for status labels (warm/critical/etc).',
    props: [
      { name: 'text', type: 'string', required: true, doc: 'Badge content.' },
      { name: 'color', type: 'colour', doc: 'Tint colour. Background = 18% of this colour. Default `accent`.' },
    ],
    variants: [
      { name: 'good', view: { type: 'badge', text: 'cool', color: 'good' } },
      { name: 'warn', view: { type: 'badge', text: 'warm', color: 'warn' } },
      { name: 'bad',  view: { type: 'badge', text: 'critical', color: 'bad' } },
    ],
  },
  // ── Iconography ────────────────────────────────────────────────────────
  {
    tag: 'icon',
    title: 'icon',
    category: 'iconography',
    description: 'Lucide-react icon by name. Names: sun, cloud, cloud-sun, cloud-rain, cloud-fog, cloud-drizzle, cloud-snow, cloud-rain-wind, cloud-lightning, help-circle, droplet, wind, snowflake, zap, thermometer, cpu, fan, lightbulb, monitor, activity, music, volume, battery, wifi, hash, clock, warning, check, info, power, trending-up, trending-down, arrow-up-right, arrow-down-right, chart, news, coins, play, pause, square, rotate-ccw, chevron-up, chevron-down, plus, app-window.',
    props: [
      { name: 'name', type: 'string', required: true, doc: 'Icon name (binding-friendly).' },
      { name: 'size', type: 'number', doc: 'Pixel size. Default 18.' },
      { name: 'color', type: 'colour', doc: 'Stroke colour token or CSS value.' },
    ],
    variants: [
      { name: 'sun (24)', view: { type: 'icon', name: 'sun', size: 24, color: 'accent-glow' } },
      { name: 'cloud-rain (24)', view: { type: 'icon', name: 'cloud-rain', size: 24, color: 'accent-glow' } },
      { name: 'thermometer (24)', view: { type: 'icon', name: 'thermometer', size: 24, color: 'accent' } },
      { name: 'binding via weatherIcon()', view: { type: 'icon', name: '{weatherIcon(63)}', size: 24, color: 'accent' } },
    ],
  },
  {
    tag: 'image',
    title: 'image',
    category: 'iconography',
    description: 'Embed a static image from the widget bundle. Path is resolved against `/widgets-api/installed/{id}/asset/...`.',
    props: [
      { name: 'src', type: 'string', required: true, doc: 'Relative path from the widget root.' },
      { name: 'alt', type: 'string', doc: 'Accessible label.' },
      { name: 'fit', type: 'contain|cover|fill|scale-down', doc: 'object-fit. Default contain.' },
    ],
    variants: [],
  },
  // ── Indicators ─────────────────────────────────────────────────────────
  {
    tag: 'ring',
    title: 'ring',
    category: 'indicators',
    description: 'Circular progress arc with optional centre content. Thresholds escalate colour as `value` crosses limits.',
    props: [
      { name: 'value', type: 'number', required: true, doc: 'Current value.' },
      { name: 'min/max', type: 'number', required: true, doc: 'Range bounds.' },
      { name: 'color', type: 'colour', doc: 'Base ring colour.' },
      { name: 'thickness', type: 'number', doc: 'Stroke width.' },
      { name: 'thresholds', type: 'array', doc: '[{ above|below: number, color: token|css }]' },
      { name: 'center', type: 'view', doc: 'Content rendered inside the ring.' },
    ],
    variants: [
      {
        name: 'CPU temp with thresholds',
        view: {
          type: 'ring',
          value: '{data.cpu.temperature.value}',
          min: 20, max: 100, color: 'accent',
          thresholds: [{ above: 80, color: 'warn' }, { above: 95, color: 'bad' }],
          center: { type: 'value', text: '{data.cpu.temperature.value}', unit: '°', size: 22 },
        },
        size: { width: 160, height: 160 },
      },
    ],
  },
  {
    tag: 'bar',
    title: 'bar',
    category: 'indicators',
    description: 'Horizontal or vertical progress bar with thresholds. Horizontal track defaults to 8 px (same visual weight as a slider track + a hair, since there\'s no thumb). Discrete-segment mode lights up N cells along the axis for a mixer-strip look.',
    props: [
      { name: 'value', type: 'number', required: true, doc: 'Current value.' },
      { name: 'min/max', type: 'number', doc: 'Range bounds. Default 0/100.' },
      { name: 'color', type: 'colour', doc: 'Fill colour.' },
      { name: 'trackColor', type: 'colour', doc: 'Background track colour. Default a 12 %-opacity wash of the panel text token.' },
      { name: 'thresholds', type: 'array', doc: '[{ above|below: number, color: token|css }]' },
      { name: 'orientation', type: 'horizontal|vertical', doc: 'Default horizontal.' },
      { name: 'height', type: 'number', doc: 'Override horizontal track thickness in px (default 8).' },
      { name: 'segments', type: 'number', doc: 'Stack N discrete cells along the axis and fill the first N×pct. 0 = continuous bar.' },
    ],
    variants: [
      {
        name: '38% with warn at 80',
        view: {
          type: 'bar', value: '{data.cpu.load.value}', min: 0, max: 100,
          color: 'accent', thresholds: [{ above: 80, color: 'warn' }],
        },
        size: { width: 200, height: 40 },
      },
      {
        name: 'vertical 10-segment mixer',
        view: {
          type: 'bar', value: 65, min: 0, max: 100, color: 'accent',
          orientation: 'vertical', segments: 10,
        },
        size: { width: 36, height: 180 },
      },
    ],
  },
  {
    tag: 'range',
    title: 'range',
    category: 'indicators',
    description: 'Fill between [lo, hi] within [min, max]. Used for daily H/L visualisations.',
    props: [
      { name: 'lo', type: 'number', required: true, doc: 'Range low.' },
      { name: 'hi', type: 'number', required: true, doc: 'Range high.' },
      { name: 'min', type: 'number', required: true, doc: 'Global axis low.' },
      { name: 'max', type: 'number', required: true, doc: 'Global axis high.' },
      { name: 'color', type: 'colour', doc: 'Solid fill colour (ignored if `gradient` is set).' },
      { name: 'gradient', type: 'colour[]', doc: 'Array of 2+ colour stops for a linear-gradient(90deg, ...) fill.' },
      { name: 'glow', type: 'boolean', doc: 'Soft outer shadow around the fill.' },
      { name: 'height', type: 'number', doc: 'Track pixel height. Default ~6px clamped.' },
      { name: 'radius', type: 'number', doc: 'Border radius. Default 999 (pill).' },
    ],
    variants: [
      {
        name: 'gradient (blue → accent → amber)',
        view: {
          type: 'range', lo: 18, hi: 25, min: 16, max: 28,
          gradient: ['#38bdf8d2', 'accent-glow', '#fbbf24e6'], glow: true, height: 5,
        },
        size: { width: 220, height: 12 },
      },
      {
        name: 'solid colour',
        view: { type: 'range', lo: 40, hi: 70, min: 0, max: 100, color: 'accent' },
        size: { width: 220, height: 12 },
      },
    ],
  },
  {
    tag: 'sparkline',
    title: 'sparkline',
    category: 'indicators',
    description: 'Rolling time-series line. Each render pushes the current value into a per-widgetId ring buffer.',
    props: [
      { name: 'value', type: 'number', required: true, doc: 'Most recent sample.' },
      { name: 'min/max', type: 'number', doc: 'Y-axis range.' },
      { name: 'color', type: 'colour', doc: 'Line colour.' },
      { name: 'thickness', type: 'number', doc: 'Line width.' },
      { name: 'points', type: 'number', doc: 'Buffer length. Default 60.' },
    ],
    variants: [
      {
        name: 'CPU temp trend',
        view: {
          type: 'sparkline', value: '{data.cpu.temperature.value}', min: 30, max: 100,
          color: 'accent', thickness: 2, points: 60,
        },
        size: { width: 280, height: 60 },
      },
    ],
  },
  {
    tag: 'gauge',
    title: 'gauge',
    category: 'indicators',
    description: 'Dial gauge with configurable arc sweep. arc=180 is the classic half-gauge; arc=270 matches the legacy "arc270" design; arc=360 is a full ring (use `ring` for that case).',
    props: [
      { name: 'value', type: 'number', required: true, doc: 'Current value.' },
      { name: 'min/max', type: 'number', doc: 'Range bounds.' },
      { name: 'arc', type: 'number', doc: 'Sweep in degrees (10..360). Default 180.' },
      { name: 'color', type: 'colour', doc: 'Arc colour.' },
      { name: 'thickness', type: 'number', doc: 'Arc stroke width.' },
      { name: 'thresholds', type: 'array', doc: '[{ above|below: number, color: token|css }]' },
      { name: 'center', type: 'view', doc: 'Content rendered inside the gauge.' },
    ],
    variants: [
      {
        name: 'half-gauge (arc 180)',
        view: {
          type: 'gauge', value: '{data.cpu.load.value}', min: 0, max: 100, arc: 180, color: 'accent',
          center: { type: 'value', text: '{data.cpu.load.value}', unit: '%', size: 18 },
        },
        size: { width: 160, height: 120 },
      },
      {
        name: 'arc 270 (legacy arc270)',
        view: {
          type: 'gauge', value: '{data.cpu.load.value}', min: 0, max: 100, arc: 270, color: 'accent',
          center: { type: 'value', text: '{data.cpu.load.value}', unit: '%', size: 18 },
        },
        size: { width: 160, height: 160 },
      },
    ],
  },
  // ── Logic + interactive ────────────────────────────────────────────────
  {
    tag: 'switch',
    title: 'switch',
    category: 'logic',
    description: 'Multi-way branch on a bound value. Picks one of `cases` by string match; falls through to `default` when nothing matches. Use for design pickers (Clock has 5 designs, Lighting will have modes, etc.).',
    props: [
      { name: 'value', type: 'expression', required: true, doc: 'Bound value coerced to string for matching.' },
      { name: 'cases', type: 'map<view>', required: true, doc: '{ "key": view, ... }' },
      { name: 'default', type: 'view', doc: 'Rendered when no case matches.' },
    ],
    variants: [
      {
        name: 'design picker',
        view: {
          type: 'switch', value: 'accent',
          cases: {
            accent: { type: 'badge', text: 'accent case', color: 'accent' },
            warn:   { type: 'badge', text: 'warn case',   color: 'warn' },
          },
          default: { type: 'badge', text: 'fallback', color: 'text' },
        },
      },
    ],
  },
  {
    tag: 'svg',
    title: 'svg',
    category: 'iconography',
    description: 'Inline a bundled SVG asset and rewrite attributes via declarative bindings. Used by Clock\'s analog face — rotates `.hour-hand`, `.minute-hand`, `.second-hand` each tick.',
    props: [
      { name: 'src', type: 'string', required: true, doc: 'Bundle-relative SVG path.' },
      { name: 'bindings', type: 'array', doc: '[{ selector, attr, value }] — rewrite attrs at render time. Allowed attrs: transform, fill, stroke, stroke-width, opacity, x/y, cx/cy/r, d, points, …' },
    ],
    variants: [],
  },
  {
    tag: 'button',
    title: 'button',
    category: 'interactive',
    description: 'Tap target that fires a host action and/or mutates widget-local state. The button stretches to fill its flex cell — wrap it in a small frame if you need a chip-size hit area. Use `child` to render an icon or icon+text label inside.',
    props: [
      { name: 'child', type: 'view', doc: 'View rendered as the button label (icon, text, or composite stack).' },
      { name: 'label', type: 'string', doc: 'Accessible label (aria-label). Bindable.' },
      { name: 'color', type: 'colour', doc: 'Tint applied to the pressed-state background. Default accent.' },
      { name: 'disabled', type: 'boolean', doc: 'Block input + dim to 50 %.' },
      { name: 'onClick', type: '{action?, args?, localUpdate?}', doc: 'Either or both. `action` posts to /widgets-api/dispatch (gated by capabilities.dispatch); `localUpdate` mutates `local.*` keys. localUpdate runs first so a server action sees the post-mutation state.' },
    ],
    variants: [
      {
        name: 'icon-only action',
        view: {
          type: 'button', label: 'Set brightness',
          onClick: { action: 'displays.setBrightness', args: { id: '{settings.displayId}', value: 80 } },
          child: { type: 'icon', name: 'sun', size: 22, color: 'accent' },
        },
        size: { width: 88, height: 88 },
      },
      {
        name: 'reset (localUpdate only)',
        view: {
          type: 'button', label: 'Reset',
          onClick: { localUpdate: { running: false, pausedElapsed: 0, startedAt: 0 } },
          child: {
            type: 'hstack', gap: 6, align: 'center',
            children: [
              { type: 'icon', name: 'rotate-ccw', size: 14 },
              { type: 'text', text: 'Reset', size: 12, transform: 'none' },
            ],
          },
        },
        size: { width: 140, height: 44 },
      },
    ],
  },
  {
    tag: 'stepper',
    title: 'stepper',
    category: 'interactive',
    description: '▲ value ▼ column that mutates one widget-local state key. Wraps min↔max. Drives the timer\'s in-widget H/M/S setup phase, but works for any "pick a small integer" pattern.',
    props: [
      { name: 'key', type: 'string', required: true, doc: 'Local state key to read + write (e.g. "hours").' },
      { name: 'min/max', type: 'number', required: true, doc: 'Inclusive bounds. Mutate wraps min↔max.' },
      { name: 'step', type: 'number', doc: 'Increment per tap. Default 1.' },
      { name: 'pad', type: 'number', doc: 'Zero-pad the display to N digits. Default 2. Use 0 to disable.' },
      { name: 'size', type: 'number', doc: 'Value font-size in px.' },
      { name: 'iconSize', type: 'number', doc: 'Chevron icon size in px.' },
      { name: 'weight', type: 'thin|...|black', doc: 'Value font weight. Default bold.' },
      { name: 'color', type: 'colour', doc: 'Text + chevron colour token or CSS value.' },
    ],
    variants: [
      {
        name: 'hours picker (00–23)',
        view: { type: 'stepper', key: 'hours', min: 0, max: 23, size: 24, iconSize: 12 },
        size: { width: 56, height: 90 },
      },
    ],
  },
  {
    tag: 'slider',
    title: 'slider',
    category: 'interactive',
    description: 'Drag-to-set range input. Fires `onChange` continuously (throttled) + `onCommit` on release. Both are dispatched through /widgets-api/dispatch against the widget\'s capabilities.dispatch allowlist. Vertical with segments=N gives the mixer-strip look (legacy displays brightness).',
    props: [
      { name: 'value', type: 'number', required: true, doc: 'Current bound value (data source).' },
      { name: 'min/max', type: 'number', doc: 'Range bounds. Default 0–100.' },
      { name: 'orientation', type: 'horizontal|vertical', doc: 'Default horizontal.' },
      { name: 'segments', type: 'number', doc: 'Discrete-segment count for the mixer-strip look. 0 = continuous bar.' },
      { name: 'color', type: 'colour', doc: 'Fill colour.' },
      { name: 'disabled', type: 'boolean', doc: 'Block input + dim.' },
      { name: 'onChange', type: '{action, args}', doc: 'Fires throughout drag.' },
      { name: 'onCommit', type: '{action, args}', doc: 'Fires on release.' },
    ],
    variants: [
      {
        name: 'continuous horizontal',
        view: {
          type: 'slider', value: 65, min: 0, max: 100, color: 'accent',
        },
        size: { width: 240, height: 40 },
      },
      {
        name: 'vertical mixer strip (12 segments)',
        view: {
          type: 'slider', value: 65, min: 0, max: 100, color: 'accent',
          orientation: 'vertical', segments: 12,
        },
        size: { width: 60, height: 180 },
      },
    ],
  },
  // ── Performance gauge family (decorator meters for monitoring widgets) ─
  {
    tag: 'water-level',
    title: 'water-level',
    category: 'indicators',
    description: 'Vertical tank that fills from the bottom. Pairs nicely with a value + label overlay for a literal "tank filling" metaphor (legacy WaterLevelGauge).',
    props: [
      { name: 'value', type: 'number 0-100', required: true, doc: 'Percent fill.' },
      { name: 'formatted', type: 'string', doc: 'Pre-formatted value text overlaid.' },
      { name: 'label', type: 'string', doc: 'Caption.' },
      { name: 'color', type: 'colour', doc: 'Fill colour.' },
    ],
    variants: [
      { name: '65% CPU', view: { type: 'water-level', value: 65, formatted: '65%', label: 'CPU' }, size: { width: 120, height: 160 } },
    ],
  },
  {
    tag: 'thermometer',
    title: 'thermometer',
    category: 'indicators',
    description: 'Vertical tube + bulb. The bulb stays lit; the stem fills with value. Pairs with text on the right side.',
    props: [
      { name: 'value', type: 'number 0-100', required: true, doc: 'Percent fill.' },
      { name: 'formatted', type: 'string', doc: 'Pre-formatted value (e.g. "72°C").' },
      { name: 'label', type: 'string', doc: 'Caption.' },
      { name: 'color', type: 'colour', doc: 'Fill colour. Default `accent`.' },
    ],
    variants: [
      { name: '72°C', view: { type: 'thermometer', value: 72, formatted: '72°C', label: 'CPU TEMP' }, size: { width: 160, height: 160 } },
    ],
  },
  {
    tag: 'number-fill',
    title: 'number-fill',
    category: 'indicators',
    description: 'Big numeric reading with a bright clip-mask that rises from the bottom as value increases. Square-root mapping so small percentages still produce visible fill movement.',
    props: [
      { name: 'value', type: 'number 0-100', required: true, doc: 'Percent (drives the fill).' },
      { name: 'formatted', type: 'string', doc: 'Display text (the numeric reading).' },
      { name: 'label', type: 'string', doc: 'Caption below.' },
      { name: 'color', type: 'colour', doc: 'Bright fill colour.' },
    ],
    variants: [
      { name: '38% load', view: { type: 'number-fill', value: 38, formatted: '38%', label: 'CPU' }, size: { width: 160, height: 160 } },
    ],
  },
  {
    tag: 'dot-grid',
    title: 'dot-grid',
    category: 'indicators',
    description: 'N×M dot matrix where filled count = value. Fills bottom row first, left-to-right.',
    props: [
      { name: 'value', type: 'number 0-100', required: true, doc: 'Percent.' },
      { name: 'cols', type: 'number', doc: 'Default 5.' },
      { name: 'rows', type: 'number', doc: 'Default 5.' },
      { name: 'formatted', type: 'string', doc: 'Optional reading overlaid below.' },
      { name: 'label', type: 'string', doc: 'Caption.' },
      { name: 'color', type: 'colour', doc: 'Filled-dot colour.' },
    ],
    variants: [
      { name: '5×5, 48% filled', view: { type: 'dot-grid', value: 48, cols: 5, rows: 5, formatted: '48%', label: 'GPU' }, size: { width: 160, height: 160 } },
    ],
  },
  {
    tag: 'microbars',
    title: 'microbars',
    category: 'indicators',
    description: 'Row of tiny vertical bars from the last N samples of a history array — denser than a sparkline, great when you want to see the shape of recent activity at a glance.',
    props: [
      { name: 'history', type: 'number[]', required: true, doc: 'Sample buffer (treated as percents).' },
      { name: 'count', type: 'number', doc: 'Bars to draw. Default 10.' },
      { name: 'formatted', type: 'string', doc: 'Optional reading.' },
      { name: 'label', type: 'string', doc: 'Caption.' },
      { name: 'color', type: 'colour', doc: 'Bar colour.' },
    ],
    variants: [
      {
        name: '10-bar microhistory',
        view: { type: 'microbars', history: [12, 18, 35, 28, 52, 67, 71, 60, 48, 55], formatted: '55%', label: 'CPU' },
        size: { width: 220, height: 80 },
      },
    ],
  },
  {
    tag: 'wedge',
    title: 'wedge',
    category: 'indicators',
    description: 'Pie wedge that sweeps clockwise from 12 o\'clock as value rises. Compact, dramatic, good for "single big number" cards.',
    props: [
      { name: 'value', type: 'number 0-100', required: true, doc: 'Percent.' },
      { name: 'formatted', type: 'string', doc: 'Value reading rendered below.' },
      { name: 'label', type: 'string', doc: 'Caption.' },
      { name: 'color', type: 'colour', doc: 'Wedge fill colour.' },
    ],
    variants: [
      { name: '72% load', view: { type: 'wedge', value: 72, formatted: '72%', label: 'CPU' }, size: { width: 160, height: 180 } },
    ],
  },
];

// Bindings + helpers cheat sheet. Surfaced under its own page in the
// reference UI. Keep entries short — link to source files in the doc
// strings, not full transcripts.
export const BINDINGS_CHEATSHEET = {
  scope: [
    { name: 'data.*', doc: 'Resolved data sources from manifest.data. Sensors, REST fetches, worker payloads, host-action results, and clock readings all live under here.' },
    { name: 'settings.*', doc: 'User settings keyed by `manifest.settings[].key`.' },
    { name: 'local.*', doc: 'Per-instance state from the manifest\'s `local` block. Persisted to localStorage keyed by (widgetId, instanceId). Mutated client-side via `button.onClick.localUpdate`.' },
    { name: 'size.width / size.height', doc: 'Container dimensions in px. Useful for size-conditional logic.' },
    { name: 'data.item.*', doc: 'INSIDE a repeat template: the current array element.' },
    { name: 'data.index', doc: 'INSIDE a repeat template: 0-based index.' },
  ],
  operators: [
    { sig: '+ - * / %', doc: 'Numeric arithmetic. Strings are coerced; bindings can\'t concatenate text.' },
    { sig: '< <= > >= == !=', doc: 'Numeric / equality comparison.' },
    { sig: '&& || !', doc: 'Logical AND / OR / NOT. Short-circuits like JS.' },
  ],
  functions: [
    { sig: 'if(cond, a, b)', doc: 'Ternary. Returns `a` when truthy, else `b`.' },
    { sig: 'round / floor / ceil(n)', doc: 'Integer rounding.' },
    { sig: 'min / max(a, b, ...)', doc: 'Variadic min/max.' },
    { sig: 'min_of / max_of(array)', doc: 'Min/max across an array of numbers.' },
    { sig: 'clamp(v, lo, hi)', doc: 'Constrain to range.' },
    { sig: 'pct(v, lo, hi)', doc: 'Returns 0–1 fractional position.' },
    { sig: 'lerp(a, b, t)', doc: 'Linear interpolation.' },
    { sig: 'len(arr|str)', doc: 'Length of array or string.' },
    { sig: 'first(arr) / last(arr)', doc: 'First / last element of an array.' },
    { sig: 'isnum(v) / isnull(v)', doc: 'Type predicates.' },
    { sig: 'abs(n)', doc: 'Absolute value.' },
    { sig: 'now()', doc: 'Current `Date.now()` in ms. Pair with `data.<tick>` from a clock data source to force re-evaluation on every tick.' },
    { sig: 'formatDuration(ms, mode)', doc: 'Format ms as a clock string. Modes: `auto` (h:mm:ss when hours > 0, else mm:ss), `hms` (always h:mm:ss), `ms` (mm:ss), `hmsAuto` (auto-hours, no hundredths), `msHundredths` (mm:ss.HH), `hundredths` (just `.HH` — pair with another formatDuration for a digits + fraction split).' },
    { sig: 'weatherIcon(wmoCode)', doc: 'WMO weather code → icon name. Lets weather widgets stay declarative.' },
  ],
  colors: [
    { name: 'accent / accent-deep / accent-glow', doc: 'Panel accent palette.' },
    { name: 'good / warn / bad', doc: 'Status colours (green / amber / red).' },
    { name: 'text / text-dim / text-faded', doc: 'Foreground tones.' },
    { name: 'border / bg-card', doc: 'Surface chrome tokens.' },
    { name: 'transparent / currentColor', doc: 'Standard CSS keywords.' },
    { name: '#rrggbb / rgba(...)', doc: 'Any CSS colour string is passed through.' },
  ],
};

/** Data-source catalog. Every key in manifest.data is one of these shapes. */
export const DATA_SOURCES_CHEATSHEET = [
  {
    name: 'sensor',
    shape: '{ "sensor": "cpu.package.temperature" }',
    doc: 'Local hardware sensor reading. Accepts exact ids, globs (cpu.*.temperature*), or friendly aliases (cpu.package.temperature, cpu.load, gpu.0.temperature, memory.load, …). Resolves to `{ id, name, value, formatted, units, parentId, parentName, timestamp }`. String can be a binding so settings can pick which sensor.',
  },
  {
    name: 'fetch',
    shape: '{ "fetch": "https://api.example.com/...", "refresh": "10m", "extract": { "key": "$.path.to.value" } }',
    doc: 'HTTPS endpoint pulled through the host proxy. Allowlist enforced from capabilities.net.fetch. Minimum refresh cadence 30s. `extract` runs JSONPath against the response and projects into the data value; `_raw` always holds the full body.',
  },
  {
    name: 'worker',
    shape: '{ "worker": "myPayloadKey" }',
    doc: 'Passthrough from the Tier 2 worker. Requires capabilities.code = "worker" and a worker.js that calls nexus.publish({ myPayloadKey: ... }). Authors write arbitrary JS for data prep, but rendering stays declarative.',
  },
  {
    name: 'clock',
    shape: '{ "clock": { "tickEvery": "1s", "timezone": "{settings.tz}" } }',
    doc: 'Host-provided ticking time. `tickEvery` accepts any duration the renderer\'s parseCadence understands (`100ms`, `500ms`, `1s`, `1m`), with a 100 ms floor. Value is { iso, hour, hour12, minute, second, ampm, weekday, day, month, year, time24, time12, timeWithSeconds, date, hourAngle, minuteAngle, secondAngle }. Use the *Angle fields for analog clock SVG bindings. Also useful as a re-render heartbeat for widgets that compute display strings from `now()` (stopwatch, timer).',
  },
  {
    name: 'host',
    shape: '{ "host": { "action": "displays.list", "refresh": "5s", "args": {} } }',
    doc: 'Polls a registered host action via /widgets-api/dispatch on the given cadence. Action name must appear in capabilities.dispatch. Surfaces the handler\'s result object as the data value.',
  },
];

/** Manifest capabilities reference. */
export const CAPABILITIES_CHEATSHEET = [
  {
    name: 'sensors.read',
    type: 'string[]',
    doc: 'Glob patterns for sensors the widget may read. ["cpu.*"] grants all CPU sensors; ["cpu.package.temperature"] grants exactly that one.',
  },
  {
    name: 'rgb.read / rgb.write',
    type: 'boolean',
    doc: 'Future RGB inspection / control. Default false.',
  },
  {
    name: 'net.fetch',
    type: 'string[]',
    doc: 'Hostname allowlist for the proxy. ["api.example.com", "*.example.com"]. HTTPS only. Subdomain wildcards match one level deep.',
  },
  {
    name: 'config',
    type: 'boolean',
    doc: 'Whether the widget exposes settings. Surfaces in the panel\'s "edit widget" gear.',
  },
  {
    name: 'code',
    type: '"worker" | null',
    doc: '"worker" opts in to Tier 2 — host serves worker.js + sibling .js/.mjs files under /widgets-api/code/<session>/. Imports are CSP-restricted to same-origin so the worker can\'t fetch attacker.com scripts.',
  },
  {
    name: 'dispatch',
    type: 'string[]',
    doc: 'Host-action allowlist. ["displays.setBrightness"] lets the widget call that action via slider.onCommit / nexus.dispatch() / host data source. Server enforces the allowlist before invoking.',
  },
];

/** Registered host actions surface — populated by Nexus itself. Each handler
 *  lives in nexus-service/src/Widgets/WidgetActions/*.cs and is wired into
 *  the WidgetActionRegistry at startup. Widgets opt in via capabilities.dispatch. */
export const DISPATCH_ACTIONS_CHEATSHEET = [
  {
    name: 'displays.list',
    args: '{ }',
    returns: '{ hint, displays: [{ id, name, capabilities, brightnessControl: { supported, current, status, … } }] }',
    doc: 'Enumerate connected monitors + their brightness control capabilities. Pair with `host` data source for live polling. Used by com.hellonexus.displays.',
  },
  {
    name: 'displays.setBrightness',
    args: '{ id: string, value: number 0-100 }',
    returns: '{ id, brightness, requestedBrightness, appliedBrightness, status }',
    doc: 'Drive a monitor\'s brightness (DDC/CI external, helper-proxied internal). Slider.onCommit fires this. status "applied" means the hardware acknowledged the write.',
  },
];

/** Manifest schema reference. Each key here is part of the top-level
 *  nexus.widget/2 envelope. */
export const MANIFEST_CHEATSHEET = [
  { key: 'schema', doc: 'Must be `"nexus.widget/2"`.' },
  { key: 'id', doc: 'Reverse-DNS, lowercase alphanumerics + `-` `.`. Must match the widget folder name.' },
  { key: 'name / version / description / author', doc: 'Marketplace listing metadata. version is semver-like.' },
  { key: 'icon', doc: 'Bundle-relative SVG/PNG used as the marketplace + Add-Widget card icon.' },
  { key: 'min_nexus_version', doc: 'Refuse to load if host is older.' },
  { key: 'surfaces', doc: 'Where the widget runs: ["dashboard"], or include "phone".' },
  { key: 'sizes', doc: '["2x2", "4x2", "4x4"] — authorised sizes only.' },
  { key: 'default_size', doc: 'Initial drop-from-catalog size.' },
  { key: 'capabilities', doc: 'See capabilities section.' },
  { key: 'settings', doc: 'Array of user-editable fields. Each entry: { key, type, label, default, [min, max, step, options] }. Types: string, number, boolean, color, select, sensor, text.' },
  { key: 'fonts', doc: 'Optional [{ name, src, weight, style }]. Loaded via FontFace API + scoped to the widget id; reference from text/value meters via `font: "name"`.' },
  { key: 'data', doc: 'Map of source name → spec. See data-sources section.' },
  { key: 'view', doc: 'Either a single view tree or `{ "2x2": ..., "4x2": ..., "4x4": ... }`. Renderer walks it against the meter palette.' },
];
