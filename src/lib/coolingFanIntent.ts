// A fan another page asked the Cooling page to select; taken once, when that page has loaded.
let pending: string | null = null;

export function requestCoolingFan(id: string): void {
  pending = id;
}

export function takeCoolingFan(): string | null {
  const id = pending;
  pending = null;
  return id;
}
