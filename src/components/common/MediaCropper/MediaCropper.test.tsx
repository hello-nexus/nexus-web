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
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('passes the unticked box through to the commit', () => {
    const { onConfirm } = renderCropper({ allowTransparency: true });

    fireEvent.click(checkbox()!);
    fireEvent.click(screen.getByText('cropper.confirm'));
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('carries the choice through the Enter shortcut too', () => {
    const { onConfirm } = renderCropper({ allowTransparency: true });

    fireEvent.click(checkbox()!);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), false);
  });
});
