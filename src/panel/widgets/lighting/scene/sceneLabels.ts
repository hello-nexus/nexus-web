import type { SceneAnchor, SceneObject } from '../../../../api/lightingScene';
import { isDeskKind } from '../../../../lib/scene/deskCatalog';

type T = (key: string, params?: Record<string, string | number>) => string;

// Mount positions with their own label; any other reads as a plain fan or strip.
const FAN_POSITIONS = ['front', 'top', 'rear', 'bottom', 'side'] as const;
const STRIP_POSITIONS = ['front', 'top'] as const;

export function objectLabel(t: T, obj: SceneObject): string {
  if (obj.label) return obj.label;
  if (obj.kind === 'case') return t('lighting.scene.kind.case');
  return isDeskKind(obj.kind) ? t(`lighting.scene.kind.${obj.kind}`) : obj.kind;
}

/** A surface's name from its kind and slot key, so imported and hand-made scenes read alike in every language. */
export function anchorLabel(t: T, obj: SceneObject, anchor: SceneAnchor): string {
  const parts = anchor.id.split(':');
  switch (anchor.kind) {
    case 'fan': {
      const position = FAN_POSITIONS.find(p => (parts[1] ?? '').startsWith(p));
      const n = Number(parts[3]);
      return t(`lighting.scene.anchor.fan.${position ?? 'other'}`, { n: Number.isFinite(n) ? n + 1 : 1 });
    }
    case 'radiator': {
      const n = Number(parts[parts.length - 1]);
      return t('lighting.scene.anchor.radiator', { n: Number.isFinite(n) ? n + 1 : 1 });
    }
    case 'ram': {
      const n = Number(parts[1]);
      return t('lighting.scene.anchor.ram', { n: Number.isFinite(n) ? n + 1 : 1 });
    }
    case 'strip': {
      const position = STRIP_POSITIONS.find(p => (parts[1] ?? '').startsWith(p));
      return t(`lighting.scene.anchor.strip.${position ?? 'other'}`);
    }
    case 'gpu':
    case 'board':
    case 'pump':
    case 'psu':
    case 'panel':
      return t(`lighting.scene.anchor.${anchor.kind}`);
    case 'surface':
      return objectLabel(t, obj);
    default:
      return anchor.label ?? objectLabel(t, obj);
  }
}
