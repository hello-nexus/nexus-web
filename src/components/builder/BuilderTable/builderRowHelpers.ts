import type { ComponentCategory, ComponentOption, RetailerListing } from '../../../types/builder';

/**
 * Inline key specs shown next to the product name in the build list. One or
 * two values per category (CPU cores, PSU wattage, etc).
 */
interface KeySpec { label: string; value: string; }

export function getKeySpecs(category: ComponentCategory, c: ComponentOption): KeySpec[] {
  const out: KeySpec[] = [];
  const specs = c.specs ?? {};
  const push = (label: string, v: unknown, unit = '') => {
    if (v == null || v === '') return;
    const s = typeof v === 'number' ? `${v}${unit}` : String(v);
    out.push({ label, value: s });
  };
  switch (category) {
    case 'cpu':
      push('cores', specs.cores);
      push('TDP', specs.tdp, 'W');
      break;
    case 'gpu':
      push('VRAM', specs.vramGb, 'GB');
      push('TDP', specs.tdp, 'W');
      break;
    case 'motherboard':
      push('socket', specs.socket);
      push('', specs.formFactor);
      break;
    case 'ram':
      push('', specs.capacityGb != null ? `${specs.capacityGb} GB` : null);
      push('', specs.speed != null ? `${specs.ddrType ?? ''}-${specs.speed}`.replace(/^-/, '') : null);
      break;
    case 'storage':
      push('', specs.capacityGb != null ? `${specs.capacityGb} GB` : null);
      push('', specs.interface);
      break;
    case 'psu':
      push('', specs.wattage != null ? `${specs.wattage}W` : null);
      push('', specs.efficiency);
      break;
    case 'cooler':
      push('', specs.type);
      push('', specs.radiatorMm != null ? `${specs.radiatorMm}mm` : null);
      break;
    case 'case':
      push('', Array.isArray(specs.formFactors) ? specs.formFactors.join(', ') : specs.formFactors);
      break;
    case 'monitor':
      push('', specs.sizeInches != null ? `${specs.sizeInches}"` : null);
      push('', specs.refreshHz != null ? `${specs.refreshHz}Hz` : null);
      break;
  }
  return out.slice(0, 2);
}

/**
 * "Buy now" URL precedence: the retailer locked in on this build, else the
 * cheapest in-stock listing, else the first listing with any URL. Returns
 * null when there are no retailer entries at all.
 */
export function resolveBuyUrl(c: ComponentOption, selectedRetailer: string | null): string | null {
  if (!c.retailers || c.retailers.length === 0) return null;
  if (selectedRetailer) {
    const hit = c.retailers.find(r => r.slug === selectedRetailer && !!r.url);
    if (hit) return hit.url;
  }
  const inStock = c.retailers
    .filter(r => r.inStock && !!r.url)
    .slice()
    .sort((a, b) => (effectivePrice(a) ?? Infinity) - (effectivePrice(b) ?? Infinity));
  if (inStock.length > 0) return inStock[0].url;
  return c.retailers.find(r => !!r.url)?.url ?? null;
}

function effectivePrice(r: RetailerListing): number | null {
  return r.salePrice ?? r.price;
}
