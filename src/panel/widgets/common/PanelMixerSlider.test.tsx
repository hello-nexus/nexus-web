import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PanelMixerSlider } from './PanelMixerSlider';

beforeAll(() => {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

function setup() {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  render(<PanelMixerSlider value={40} ariaLabel="Level" onChange={onChange} onCommit={onCommit} />);
  const track = screen.getByRole('slider');
  track.getBoundingClientRect = () => ({ x: 0, y: 100, top: 100, left: 0, right: 40, bottom: 200, width: 40, height: 100, toJSON: () => {} });
  const hitbox = track.parentElement as HTMLElement;
  return { hitbox, onChange, onCommit };
}

describe('PanelMixerSlider pointer end', () => {
  it('commits the release position on pointerup', () => {
    const { hitbox, onCommit } = setup();
    fireEvent.pointerDown(hitbox, { clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(hitbox, { clientY: 120, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(80);
  });

  it('a lost pointer capture closes the drag once with the last emitted value', () => {
    const { hitbox, onCommit } = setup();
    fireEvent.pointerDown(hitbox, { clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(hitbox, { clientY: 130, pointerId: 1 });
    fireEvent.lostPointerCapture(hitbox, { pointerId: 1 });
    fireEvent.lostPointerCapture(hitbox, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(70);
  });

  it('a release after the slider became disabled still closes the drag', () => {
    const onCommit = vi.fn();
    const props = { value: 40, ariaLabel: 'Level', onChange: vi.fn(), onCommit };
    const { rerender } = render(<PanelMixerSlider {...props} />);
    const track = screen.getByRole('slider');
    track.getBoundingClientRect = () => ({ x: 0, y: 100, top: 100, left: 0, right: 40, bottom: 200, width: 40, height: 100, toJSON: () => {} });
    const hitbox = track.parentElement as HTMLElement;
    fireEvent.pointerDown(hitbox, { clientY: 150, pointerId: 1 });
    rerender(<PanelMixerSlider {...props} disabled />);
    fireEvent.pointerUp(hitbox, { clientY: 120, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(50);
  });

  it('a cancel with no moves commits the pointerdown value, not max', () => {
    const { hitbox, onChange, onCommit } = setup();
    fireEvent.pointerDown(hitbox, { clientY: 150, pointerId: 1 });
    fireEvent.pointerCancel(hitbox, { clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(50);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(50);
  });

  it('a cancel after moves commits the last tracked move, not the cancel position', () => {
    const { hitbox, onCommit } = setup();
    fireEvent.pointerDown(hitbox, { clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(hitbox, { clientY: 130, pointerId: 1 });
    fireEvent.pointerCancel(hitbox, { clientY: 0, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(70);
  });
});

describe('PanelMixerSlider icon button', () => {
  function withIconButton() {
    const onClick = vi.fn();
    render(
      <PanelMixerSlider
        value={40}
        ariaLabel="Level"
        icon={<span />}
        iconButton={{ ariaLabel: 'Mute', onClick }}
        onChange={vi.fn()}
      />,
    );
    return { button: screen.getByRole('button', { name: 'Mute' }), onClick };
  }

  it('acts on the pointer release, and ignores the click that follows it', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 1 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 1 });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('acts on a release even when no click ever follows', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 2, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 2, clientX: 7, clientY: 6 });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a drag released over the icon is not a tap', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 3, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 3, clientX: 90, clientY: 5 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('the click synthesized after a rejected drag-release does not act either', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 9, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 9, clientX: 90, clientY: 5 });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a press that began elsewhere and is released over the icon is not a tap', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerUp(button, { pointerType: 'mouse', pointerId: 4, button: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a different pointer releasing over the icon is not a tap', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 5 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 6 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a cancelled touch is not a tap', () => {
    const { button, onClick } = withIconButton();
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 7 });
    fireEvent.pointerCancel(button, { pointerType: 'touch', pointerId: 7 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 7 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const onClick = vi.fn();
    render(
      <PanelMixerSlider
        value={40}
        ariaLabel="Level"
        disabled
        icon={<span />}
        iconButton={{ ariaLabel: 'Mute', onClick }}
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Mute' });
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 8 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 8 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a keyboard activation (a click with no pointer release) still works, once', () => {
    const { button, onClick } = withIconButton();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
