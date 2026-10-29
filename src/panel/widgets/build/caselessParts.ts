import type { SceneBox, SceneLayout } from '../../../lib/scene/pcScene';

export type CaselessCooler = { kind: 'aio'; radiatorMm?: number } | { kind: 'air' };

/** The parts the service detected, by name; an absent slot was not detected. */
export interface CaselessParts {
  cpu?: string;
  gpu?: string;
  ram?: string;
  board?: string;
  cooler?: CaselessCooler;
}

const SLOT_OF_PART: Record<string, keyof CaselessParts | undefined> = {
  motherboard: 'board',
  cpu: 'cpu',
  ram: 'ram',
  gpu: 'gpu',
  cooler: 'cooler',
};

/**
 * A layout resolved with no case, reduced to the detected parts inside a dashed outline of an empty case. The outline is
 * one box the shared scene already draws dashed (an estimate), sized to the layout's own extents.
 */
export function caselessLayout(layout: SceneLayout, parts: CaselessParts): SceneLayout {
  const keep = (slot: string) => {
    const part = SLOT_OF_PART[slot];
    return part !== undefined && parts[part] !== undefined;
  };
  const [depth, width, height] = layout.size;
  const outline: SceneBox = { slot: 'case', role: 'structure', source: 'estimate', min: [0, 0, 0], size: [depth, height, width] };
  return {
    size: layout.size,
    boxes: [outline, ...layout.boxes.filter(box => keep(box.slot))],
    lines: layout.lines.filter(line => keep(line.slot)),
  };
}

/** Two short lines for under the scene: processor and card, then memory, board and cooler. Absent parts are skipped. */
export function partsStrip(parts: CaselessParts, airCoolerLabel: string): [string, string] {
  const cooler = parts.cooler?.kind === 'aio' ? (parts.cooler.radiatorMm ? `${parts.cooler.radiatorMm} AIO` : 'AIO') : parts.cooler ? airCoolerLabel : undefined;
  const join = (items: (string | undefined)[]) => items.filter((item): item is string => !!item).join(', ');
  return [join([parts.cpu, parts.gpu]), join([parts.ram, parts.board, cooler])];
}

export const hasCaselessParts = (parts: CaselessParts): boolean => Object.values(parts).some(value => value !== undefined);
