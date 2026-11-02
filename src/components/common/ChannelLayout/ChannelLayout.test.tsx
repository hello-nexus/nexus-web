import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelLayout, type ChannelNode } from './ChannelLayout';

const NODES: ChannelNode[] = [
  { id: 'a', label: 'Alpha', pos: { x: -0.5, y: -0.5 }, control: <span>ctl-a</span> },
  { id: 'b', label: 'Beta', pos: { x: 0.5, y: 0.5 } },
];

describe('ChannelLayout', () => {
  it('places each node by its position and renders its control', () => {
    render(<ChannelLayout nodes={NODES} />);
    const node = screen.getByRole('button', { name: 'Alpha' }).parentElement as HTMLElement;
    expect(node.style.left).toBe('25%');
    expect(node.style.top).toBe('25%');
    expect(screen.getByText('ctl-a')).toBeInTheDocument();
  });

  it('activates a node on click', () => {
    const onActivate = vi.fn();
    render(<ChannelLayout nodes={NODES} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onActivate).toHaveBeenCalledWith('b');
  });

  it('keeps a node where it is when arrow keys are pressed', () => {
    render(<ChannelLayout nodes={NODES} />);
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect((alpha.parentElement as HTMLElement).style.left).toBe('25%');
  });

  it('describes what a click does', () => {
    render(<ChannelLayout nodes={NODES} hint="Plays a test sound" activeId="b" />);
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAccessibleDescription('Plays a test sound');
  });
});
