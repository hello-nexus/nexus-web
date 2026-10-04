import { describe, expect, it } from 'vitest';
import { parseLovelaceConfig, pickView, type HaLayoutView } from './lovelaceLayout';

function views(config: unknown): HaLayoutView[] {
  const layout = parseLovelaceConfig(config);
  if (layout.kind !== 'views') throw new Error('expected views');
  return layout.views;
}

describe('parseLovelaceConfig', () => {
  it('reports a strategy dashboard as generated', () => {
    expect(parseLovelaceConfig({ strategy: { type: 'original-states' } })).toEqual({ kind: 'generated' });
  });

  it('returns no views for junk input', () => {
    expect(parseLovelaceConfig(null)).toEqual({ kind: 'views', views: [] });
    expect(parseLovelaceConfig({ views: 'nope' })).toEqual({ kind: 'views', views: [] });
  });

  it('splits a sections view by section title and heading cards', () => {
    const [view] = views({
      views: [{
        title: 'Home',
        path: 'home',
        type: 'sections',
        sections: [
          {
            type: 'grid',
            cards: [
              { type: 'heading', heading: 'Living room' },
              { type: 'tile', entity: 'light.ceiling', name: 'Big light' },
              { type: 'tile', entity: 'switch.ac' },
              { type: 'heading', heading: 'Climate' },
              { type: 'tile', entity: 'sensor.temperature' },
            ],
          },
          { title: 'Security', cards: [{ type: 'tile', entity: 'lock.front_door' }] },
        ],
      }],
    });
    expect(view.key).toBe('home');
    expect(view.title).toBe('Home');
    expect(view.groups).toEqual([
      { title: 'Living room', items: [{ entityId: 'light.ceiling', name: 'Big light' }, { entityId: 'switch.ac' }] },
      { title: 'Climate', items: [{ entityId: 'sensor.temperature' }] },
      { title: 'Security', items: [{ entityId: 'lock.front_door' }] },
    ]);
    expect(view.skippedCards).toBe(0);
  });

  it('gives each masonry card its own group and flattens stacks', () => {
    const [view] = views({
      views: [{
        cards: [
          {
            type: 'entities',
            title: 'Lights',
            entities: ['light.a', { entity: 'light.b', name: 'Bee' }, { type: 'divider' }, { type: 'section', label: 'Plugs' }, 'switch.plug'],
          },
          { type: 'tile', entity: 'sensor.loose' },
          {
            type: 'vertical-stack',
            cards: [
              { type: 'glance', entities: ['binary_sensor.door'] },
              { type: 'conditional', conditions: [{ entity: 'input_boolean.guest' }], card: { type: 'button', entity: 'scene.evening' } },
            ],
          },
        ],
      }],
    });
    expect(view.key).toBe('0');
    expect(view.groups).toEqual([
      { title: 'Lights', items: [{ entityId: 'light.a' }, { entityId: 'light.b', name: 'Bee' }] },
      { title: 'Plugs', items: [{ entityId: 'switch.plug' }] },
      { title: '', items: [{ entityId: 'sensor.loose' }] },
      { title: '', items: [{ entityId: 'binary_sensor.door' }, { entityId: 'scene.evening' }] },
    ]);
  });

  it('counts leaf cards with nothing to show and ignores conditions', () => {
    const [view] = views({
      views: [{
        cards: [
          { type: 'markdown', content: 'hi' },
          { type: 'horizontal-stack', cards: [{ type: 'iframe', url: 'x' }, { type: 'tile', entity: 'fan.desk' }] },
          { type: 'conditional', conditions: [{ entity: 'light.hidden_condition' }], card: { type: 'markdown' } },
        ],
      }],
    });
    expect(view.skippedCards).toBe(3);
    expect(view.groups).toEqual([{ title: '', items: [{ entityId: 'fan.desk' }] }]);
  });

  it('puts view badges first and dedupes within a group', () => {
    const [view] = views({
      views: [{
        badges: ['sensor.outside', { type: 'entity', entity: 'person.me' }],
        cards: [{ type: 'entities', entities: ['light.a', 'light.a', 'not an id', 42] }],
      }],
    });
    expect(view.groups).toEqual([
      { title: '', items: [{ entityId: 'sensor.outside' }, { entityId: 'person.me' }] },
      { title: '', items: [{ entityId: 'light.a' }] },
    ]);
  });

  it('drops subviews and keeps index keys stable', () => {
    const list = views({
      views: [
        { title: 'Main', cards: [] },
        { title: 'Detail', subview: true, cards: [] },
        { title: 'Garage', cards: [] },
      ],
    });
    expect(list.map(v => [v.key, v.title])).toEqual([['0', 'Main'], ['2', 'Garage']]);
  });
});

describe('pickView', () => {
  const list = views({ views: [{ path: 'a', cards: [] }, { path: 'b', cards: [] }] });

  it('finds a view by key and falls back to the first', () => {
    expect(pickView(list, 'b')?.key).toBe('b');
    expect(pickView(list, 'gone')?.key).toBe('a');
    expect(pickView([], 'a')).toBeNull();
  });
});
