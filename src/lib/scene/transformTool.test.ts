import { describe, expect, it, vi } from 'vitest';
import { Color, Group, PerspectiveCamera, Ray, Scene, Vector3 } from 'three';
import type { SceneStage } from './sceneStage';
import { RING_GAP_MM, TransformTool, type TransformCallbacks } from './transformTool';

// A stage whose raycast hits no body and whose ray looks straight down at `floorAt`, so only the view's fallback
// pick or the turn ring can claim a press.
function stubStage(floorAt: [number, number] = [0, 0]): SceneStage {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {};
  const camera = new PerspectiveCamera(30);
  camera.position.set(0, 1000, 0);
  return {
    canvas,
    scene: new Scene(),
    camera,
    controls: { enabled: true },
    ray: new Ray(new Vector3(floorAt[0], 1000, floorAt[1]), new Vector3(0, -1, 0)),
    raycast: () => [],
    trackLines: () => {},
    untrackLines: () => {},
    requestRender: () => {},
  } as unknown as SceneStage;
}

function setup(pickFallback: TransformCallbacks['pickFallback']) {
  const stage = stubStage();
  const onContextMenu = vi.fn();
  const tool = new TransformTool(stage, new Color(), { onSelect: () => {}, onChange: () => {}, onContextMenu, pickFallback });
  tool.setTargets([{ id: 'mouse', object: new Group(), radius: 50 }]);
  return { stage, tool, onContextMenu };
}

describe('TransformTool', () => {
  it('takes a right click the body raycast missed when the view picks a known object there', () => {
    const { stage, tool, onContextMenu } = setup(() => 'mouse');
    const press = new MouseEvent('pointerdown', { button: 2, bubbles: true }) as PointerEvent;
    const stop = vi.spyOn(press, 'stopImmediatePropagation');
    stage.canvas.dispatchEvent(press);
    expect(stop).toHaveBeenCalled();
    stage.canvas.dispatchEvent(new MouseEvent('contextmenu', { button: 2 }));
    expect(onContextMenu).toHaveBeenCalledWith('mouse', expect.any(MouseEvent));
    tool.dispose();
  });

  it('ignores a fallback pick that names no target', () => {
    const { stage, tool, onContextMenu } = setup(() => 'case');
    stage.canvas.dispatchEvent(new MouseEvent('contextmenu', { button: 2 }));
    expect(onContextMenu).not.toHaveBeenCalled();
    tool.dispose();
  });

  it('turns the selection from its ring even where a neighbour spot is picked', () => {
    const onSelect = vi.fn();
    const keyboard = new Group();
    const radius = 100;
    const stage = stubStage([radius + RING_GAP_MM, 0]);
    const tool = new TransformTool(stage, new Color(), { onSelect, onChange: () => {}, pickFallback: () => 'mouse' });
    tool.setTargets([{ id: 'keyboard', object: keyboard, radius }, { id: 'mouse', object: new Group(), radius: radius / 3 }]);
    tool.setSelected('keyboard');
    stage.canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    expect(onSelect).not.toHaveBeenCalledWith('mouse');
    expect(tool.isDragging).toBe(true);
    tool.dispose();
  });
});
