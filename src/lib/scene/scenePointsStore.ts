/**
 * Where each placed device's LEDs land on the lighting canvas while the 3D view
 * drives sampling: x, y pairs in canvas units, NaN for an LED the camera cannot
 * see. Device cards read it so their live readout samples what the hardware
 * samples. Outside React, like ledFrameStore, so a camera drag does not
 * re-render the device list.
 */
let points = new Map<string, Float32Array>();

export function setScenePoints(next: Map<string, Float32Array> | null): void {
  points = next ?? new Map();
}

export function getScenePoints(deviceId: string): Float32Array | undefined {
  return points.get(deviceId);
}
