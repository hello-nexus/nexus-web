import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaCropper } from './MediaCropper';

function renderCropper(props: Partial<Parameters<typeof MediaCropper>[0]> = {}) {
  const onConfirm = vi.fn();
  render(
    <MediaCropper
      src="blob:preview"
      aspect={16 / 9}
      onConfirm={onConfirm}
      onCancel={() => {}}
      {...props}
    />,
  );
  return { onConfirm };
}

const checkbox = () => screen.queryByRole('checkbox', { name: 'cropper.keepTransparency' });

describe('MediaCropper transparency', () => {
  it('offers no transparency choice for a source with no alpha to keep', () => {
    renderCropper();
    expect(checkbox()).toBeNull();
  });

  it('defaults to keeping transparency', () => {
    const { onConfirm } = renderCropper({ allowTransparency: true });

    expect(checkbox()).toBeChecked();
    fireEvent.click(screen.getByText('cropper.confirm'));
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), true, false);
  });

  it('passes the unticked box through to the commit', () => {
    const { onConfirm } = renderCropper({ allowTransparency: true });

    fireEvent.click(checkbox()!);
    fireEvent.click(screen.getByText('cropper.confirm'));
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('carries the choice through the Enter shortcut too', () => {
    const { onConfirm } = renderCropper({ allowTransparency: true });

    fireEvent.click(checkbox()!);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});

describe('MediaCropper fit', () => {
  it('is not offered unless the consumer can letterbox', () => {
    renderCropper({ allowTransparency: true });
    expect(screen.queryByLabelText('cropper.fitWhole')).toBeNull();
  });

  it('confirms the whole frame with the fit flag when ticked', () => {
    const { onConfirm } = renderCropper({ allowFit: true });
    fireEvent.click(screen.getByLabelText('cropper.fitWhole'));
    fireEvent.click(screen.getByRole('button', { name: 'cropper.confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0, w: 1, h: 1 }), true, true);
  });

  it('stays off by default', () => {
    const { onConfirm } = renderCropper({ allowFit: true });
    fireEvent.click(screen.getByRole('button', { name: 'cropper.confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), true, false);
  });
});
