export interface SaveFilePickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: SaveFilePickerType[];
  }) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/**
 * Save a blob to disk through the native save dialog (File System Access API),
 * falling back to an anchor download where the picker is unavailable or
 * blocked. Returns false when the user cancels the dialog.
 */
export async function saveBlobToFile(
  blob: Blob,
  suggestedName: string,
  types?: SaveFilePickerType[],
): Promise<boolean> {
  const w = window as SaveFilePickerWindow;
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      // SecurityError (sandboxed/embedded contexts) and other failures fall
      // through to the anchor download.
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Firefox starts the download async and aborts it if the URL is revoked
  // synchronously; there is no download-started event to wait on.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
