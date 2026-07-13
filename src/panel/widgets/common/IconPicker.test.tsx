import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IconPicker, tabForValue } from './IconPicker';
import { uploadDeckImage } from '../../../api/deckImages';
import { resizeDeckImage } from '../deck/resizeDeckImage';
import type { DeckIcon } from '../deck/types';

vi.mock('../deck/useDeckImage', () => ({ useDeckImage: (id?: string) => (id ? 'blob:mock-preview' : null) }));
vi.mock('../deck/resizeDeckImage', () => ({ resizeDeckImage: vi.fn(async (file: Blob) => file) }));
vi.mock('../../../api/deckImages', () => ({ uploadDeckImage: vi.fn(async () => 'uploaded-id-1') }));

function renderPicker(value?: DeckIcon) {
  const onChange = vi.fn();
  const utils = render(<IconPicker value={value} onChange={onChange} surface="desktop" desktopEditor />);
  return { ...utils, onChange };
}

describe('tabForValue', () => {
  it('maps an image icon to the custom tab', () => {
    expect(tabForValue({ kind: 'image', value: 'abc' })).toBe('custom');
  });

  it('maps lucide/emoji icons and the undefined/app cases as before', () => {
    expect(tabForValue({ kind: 'lucide', value: 'Rocket' })).toBe('icons');
    expect(tabForValue({ kind: 'emoji', value: '🚀' })).toBe('emoji');
    expect(tabForValue({ kind: 'app', value: 'app1' })).toBe('auto');
    expect(tabForValue(undefined)).toBe('auto');
  });
});

describe('IconPicker tabs', () => {
  it('renders the four standard tabs', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.auto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.icons' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.emoji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'panel.iconPicker.custom' })).toBeInTheDocument();
  });

  it('opens on the Custom tab (with the current image previewed) when the value is an image icon', () => {
    renderPicker({ kind: 'image', value: 'abc' });
    expect(screen.getByText('panel.iconPicker.uploadImage')).toBeInTheDocument();
    const preview = screen.getByAltText('') as HTMLImageElement;
    expect(preview.src).toContain('blob:mock-preview');
  });
});

describe('IconPicker onTabChange', () => {
  it('fires once at mount with the tab computed from the initial value', () => {
    const onTabChange = vi.fn();
    render(<IconPicker value={{ kind: 'lucide', value: 'Rocket' }} onChange={vi.fn()} onTabChange={onTabChange} />);
    expect(onTabChange).toHaveBeenCalledWith('icons');
  });

  it('fires again whenever the user switches tabs', () => {
    const onTabChange = vi.fn();
    render(<IconPicker value={undefined} onChange={vi.fn()} onTabChange={onTabChange} />);
    onTabChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(onTabChange).toHaveBeenCalledWith('custom');
  });
});

describe('IconPicker Bug 5 - custom image survives Auto <-> Custom', () => {
  it('remembers the uploaded image id and re-emits it when returning to Custom after Auto', async () => {
    const { onChange, container, rerender } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'uploaded-id-1' }));

    // The parent commits the uploaded icon; simulate that round trip.
    rerender(<IconPicker value={{ kind: 'image', value: 'uploaded-id-1' }} onChange={onChange} surface="desktop" desktopEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.auto' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    rerender(<IconPicker value={undefined} onChange={onChange} surface="desktop" desktopEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'image', value: 'uploaded-id-1' });
  });

  it('does not re-emit when Custom is picked with no prior image ever set', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('IconPicker custom upload flow', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('resizes, uploads, and reports the new image icon through onChange', async () => {
    const { onChange, container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'image', value: 'uploaded-id-1' }));
    expect(resizeDeckImage).toHaveBeenCalledWith(file);
    expect(uploadDeckImage).toHaveBeenCalled();
  });

  it('shows an inline error and does not call onChange when the upload fails', async () => {
    vi.mocked(uploadDeckImage).mockResolvedValueOnce(null);
    const { onChange, container } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'panel.iconPicker.custom' }));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('panel.iconPicker.uploadFailed')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });
});
