// Flattens a Home Assistant Lovelace dashboard config into titled groups of
// entity references that Nexus renders with its own tiles. Card visuals are
// not reproduced: every card contributes the entities it names, and a card
// naming none (markdown, iframe, area...) is counted as skipped.

export interface HaLayoutItem {
  entityId: string;
  // Per-card name override from the dashboard, when set.
  name?: string;
}

export interface HaLayoutGroup {
  title: string;
  items: HaLayoutItem[];
}

export interface HaLayoutView {
  // view.path when set, else the view's index: the key a widget config stores.
  key: string;
  title: string;
  groups: HaLayoutGroup[];
  skippedCards: number;
}

export type HaDashboardLayout =
  | { kind: 'views'; views: HaLayoutView[] }
  // Auto-generated (strategy) dashboard: HA builds it at runtime, nothing to read.
  | { kind: 'generated' };

type Token =
  | { t: 'title'; title: string }
  | { t: 'break' }
  | { t: 'item'; item: HaLayoutItem }
  | { t: 'skip' };

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function entityItem(raw: unknown): HaLayoutItem | null {
  if (typeof raw === 'string') {
    return ENTITY_ID.test(raw) ? { entityId: raw } : null;
  }
  if (!isRecord(raw)) return null;
  const entityId = str(raw.entity);
  if (!ENTITY_ID.test(entityId)) return null;
  const name = str(raw.name);
  return name ? { entityId, name } : { entityId };
}

// Emits the card's tokens; returns whether it contributed any entity.
function walkCard(card: unknown, out: Token[]): boolean {
  if (!isRecord(card)) return false;
  let found = false;

  if (card.type === 'heading') {
    const heading = str(card.heading);
    if (heading) out.push({ t: 'title', title: heading });
    if (Array.isArray(card.badges)) {
      for (const b of card.badges) {
        const item = entityItem(b);
        if (item) { out.push({ t: 'item', item }); found = true; }
      }
    }
    // A heading card is structure, never a skipped card.
    return true;
  }

  const title = str(card.title);
  if (title) out.push({ t: 'title', title });

  const single = typeof card.entity === 'string' ? entityItem({ entity: card.entity, name: card.name }) : null;
  if (single) { out.push({ t: 'item', item: single }); found = true; }

  if (Array.isArray(card.entities)) {
    for (const row of card.entities) {
      if (isRecord(row) && row.type === 'section') {
        const label = str(row.label);
        if (label) out.push({ t: 'title', title: label });
        continue;
      }
      const item = entityItem(row);
      if (item) { out.push({ t: 'item', item }); found = true; }
    }
  }

  let nested = false;
  if (Array.isArray(card.cards)) {
    nested = true;
    for (const child of card.cards) {
      if (walkCard(child, out)) found = true;
    }
  }
  if (isRecord(card.card)) {
    nested = true;
    if (walkCard(card.card, out)) found = true;
  }

  // Containers count their own leaves; only a leaf with nothing to show is skipped.
  if (!found && !nested) out.push({ t: 'skip' });
  return found;
}

function groupTokens(tokens: Token[]): { groups: HaLayoutGroup[]; skipped: number } {
  const groups: HaLayoutGroup[] = [];
  let current: HaLayoutGroup | null = null;
  let skipped = 0;
  for (const tok of tokens) {
    if (tok.t === 'skip') { skipped++; continue; }
    if (tok.t === 'break') { current = null; continue; }
    if (tok.t === 'title') {
      current = { title: tok.title, items: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { title: '', items: [] };
      groups.push(current);
    }
    if (!current.items.some(i => i.entityId === tok.item.entityId)) current.items.push(tok.item);
  }
  return { groups: groups.filter(g => g.items.length > 0), skipped };
}

function parseView(view: Record<string, unknown>, index: number): HaLayoutView {
  const tokens: Token[] = [];

  if (Array.isArray(view.badges)) {
    for (const b of view.badges) {
      const item = entityItem(b);
      if (item) tokens.push({ t: 'item', item });
    }
    tokens.push({ t: 'break' });
  }

  if (Array.isArray(view.sections)) {
    for (const section of view.sections) {
      if (!isRecord(section)) continue;
      const title = str(section.title);
      tokens.push(title ? { t: 'title', title } : { t: 'break' });
      if (Array.isArray(section.cards)) {
        for (const card of section.cards) walkCard(card, tokens);
      }
      tokens.push({ t: 'break' });
    }
  }

  // Masonry / sidebar / panel views: each top-level card starts its own group.
  if (Array.isArray(view.cards)) {
    for (const card of view.cards) {
      tokens.push({ t: 'break' });
      walkCard(card, tokens);
    }
  }

  const { groups, skipped } = groupTokens(tokens);
  const path = str(view.path);
  return {
    key: path || String(index),
    title: str(view.title),
    groups,
    skippedCards: skipped,
  };
}

export function parseLovelaceConfig(config: unknown): HaDashboardLayout {
  if (!isRecord(config)) return { kind: 'views', views: [] };
  if (!Array.isArray(config.views)) {
    return isRecord(config.strategy) ? { kind: 'generated' } : { kind: 'views', views: [] };
  }
  const views: HaLayoutView[] = [];
  config.views.forEach((raw, index) => {
    // Subviews are reached by navigation from a card, never listed as tabs.
    if (!isRecord(raw) || raw.subview === true) return;
    views.push(parseView(raw, index));
  });
  return { kind: 'views', views };
}

// The view a widget config names, falling back to the first view.
export function pickView(views: HaLayoutView[], key: string): HaLayoutView | null {
  return views.find(v => v.key === key) ?? views[0] ?? null;
}
