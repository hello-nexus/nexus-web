import { describe, expect, it } from 'vitest';
import { genericCase, newDeskObject } from '../../../../lib/scene/deskCatalog';
import { anchorLabel, objectLabel } from './sceneLabels';

const t = (key: string, params?: Record<string, string | number>) => (params ? `${key}(${Object.values(params).join(',')})` : key);

describe('scene labels', () => {
  const pc = genericCase([]);
  const at = (id: string) => anchorLabel(t, pc, pc.anchors.find(a => a.id === id)!);

  it('names fan mounts by position and 1-based index', () => {
    expect(at('fan:front:120:0')).toBe('lighting.scene.anchor.fan.front(1)');
    expect(at('fan:rear:120:0')).toBe('lighting.scene.anchor.fan.rear(1)');
    expect(anchorLabel(t, pc, { ...pc.anchors[0], id: 'fan:psu-shroud:120:1' })).toBe('lighting.scene.anchor.fan.other(2)');
  });

  it('names parts and strips through translation keys', () => {
    expect(at('ram:2')).toBe('lighting.scene.anchor.ram(3)');
    expect(at('gpu')).toBe('lighting.scene.anchor.gpu');
    expect(at('strip:top')).toBe('lighting.scene.anchor.strip.top');
  });

  it('names a desk surface after its object', () => {
    const kb = newDeskObject('keyboard', []);
    expect(anchorLabel(t, kb, kb.anchors[0])).toBe('lighting.scene.kind.keyboard');
    expect(objectLabel(t, { ...kb, label: 'My board' })).toBe('My board');
    expect(objectLabel(t, pc)).toBe('lighting.scene.kind.case');
  });
});
