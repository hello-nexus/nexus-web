// Devices API wrapper - per-device Nexus Control toggle (release a curated
// device's port for another app while keeping it listed). Uses the same
// authed service helper as every other client.

import { postService } from './service';
import type { DeviceListItem } from '../hooks/useDevices';

export const setDeviceControl = (id: string, enabled: boolean) =>
  postService<DeviceListItem[]>('/devices/control', { id, enabled });
