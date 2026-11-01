import { useEffect, useState } from 'react';
import { DEV_TOOLS } from '../../../lib/devTools';

/** What the Build portal knows of this PC's worth; prices are the catalog's, current as of `asOf`. */
export interface BuildValueData {
  currency: string;
  /** ISO date the prices were checked. */
  asOf: string;
  /** Total of the owned parts that have a price. */
  owned: number;
  /** Total of the parts added in Build and not bought yet that have a price; absent or 0 when nothing was added. */
  upgrades?: number;
  /** Parts, owned or added, that have no known price; they are counted, never priced as zero. */
  unpriced: number;
}

/** The words around the figures, with {amount}, {count} and {date} tokens. */
export interface BuildValueLabels {
  owned: string;
  upgraded: string;
  delta: string;
  unpriced: string;
  asOf: string;
}

export interface BuildValueView {
  data: BuildValueData;
  labels: BuildValueLabels;
}

export function formatMoney(amount: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

export function formatAsOf(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' }).format(date);
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** The lines the tile shows: the owned figure, the figure with upgrades and their difference when something was added, and the notes. */
export function valueLines(view: BuildValueView, language: string) {
  const { data, labels } = view;
  const money = (n: number) => formatMoney(n, data.currency, language);
  const added = data.upgrades && data.upgrades > 0 ? data.upgrades : 0;
  return {
    ownedLabel: labels.owned,
    owned: money(data.owned),
    upgradedLabel: added ? labels.upgraded : null,
    upgraded: added ? money(data.owned + added) : null,
    delta: added ? fill(labels.delta, { amount: `+${money(added)}` }) : null,
    unpriced: data.unpriced > 0 ? fill(labels.unpriced, { count: data.unpriced }) : null,
    asOf: fill(labels.asOf, { date: formatAsOf(data.asOf, language) }),
  };
}

export const VALUE_FIXTURE_KEY = 'nexus.dev.buildValue';

/** Prototype only: dev-tools builds read the value from this local key until the service carries it; null elsewhere. */
export function useBuildValueFixture(): BuildValueView | null {
  const [view, setView] = useState<BuildValueView | null>(null);
  useEffect(() => {
    if (!DEV_TOOLS) return;
    try {
      const raw = localStorage.getItem(VALUE_FIXTURE_KEY);
      setView(raw ? (JSON.parse(raw) as BuildValueView) : null);
    } catch {
      setView(null);
    }
  }, []);
  return view;
}
