// Phone → PC transfer endpoints + the WS topic carrying received-item pushes.
// /transfer/items is LAN-only (postServiceForm fails closed over the relay
// tunnel, same as /system/open-path).

import { postService, postServiceForm } from './service';

export const TRANSFER_TOPIC = 'transfer';
export const TRANSFER_ITEMS_PATH = '/transfer/items';
export const TRANSFER_CLIPBOARD_PATH = '/transfer/clipboard';
export const SYSTEM_OPEN_PATH_PATH = '/system/open-path';

// One frame per received item. `from` is the sender device name, may be
// empty. kind 'clipboard' carries empty name/inbox.
export interface TransferFrame {
  revision: number;
  kind: 'file' | 'clipboard';
  name: string;
  size: number;
  from: string;
  inbox: string;
}

export interface TransferSavedItem {
  name: string;
  size: number;
}

export interface TransferItemsResponse {
  error?: boolean;
  msg?: string;
  saved: TransferSavedItem[];
  inbox: string;
}

export interface TransferClipboardResponse {
  error: boolean;
  msg: string;
}

export function uploadTransferItems(files: File[]): Promise<TransferItemsResponse | null> {
  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);
  return postServiceForm<TransferItemsResponse>(TRANSFER_ITEMS_PATH, form);
}

export function sendTransferClipboard(text: string): Promise<TransferClipboardResponse | null> {
  return postService<TransferClipboardResponse>(TRANSFER_CLIPBOARD_PATH, { text });
}

export function openTransferInbox(path: string): Promise<unknown> {
  return postService(SYSTEM_OPEN_PATH_PATH, { path });
}
