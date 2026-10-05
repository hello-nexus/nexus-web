import { BRAND_LOGOS } from './brandLogos';
import styles from './SupportedBrands.module.scss';

// First-party brands lead, then the catalog's largest by device count. Each
// name is also the search query a click fills in.
export const SUPPORTED_BRANDS = [
  'HYTE', 'iBUYPOWER', 'ASUS', 'MSI', 'Razer', 'Gigabyte', 'EVGA', 'Corsair',
  'SteelSeries', 'Thermaltake', 'Logitech', 'HyperX', 'Cooler Master', 'NZXT',
  'Elgato', 'Lian Li',
] as const;

interface SupportedBrandsProps {
  /** Omitted for build-time HTML, where the host page wires clicks via data-brand. */
  onSelect?: (brand: string) => void;
  className?: string;
}

/** Brand logo buttons above the Supported Devices search; a brand without a mark shows its name. */
export function SupportedBrands({ onSelect, className }: SupportedBrandsProps) {
  return (
    <div className={[styles.brands, className].filter(Boolean).join(' ')}>
      {SUPPORTED_BRANDS.map(brand => {
        const logo = BRAND_LOGOS[brand];
        return (
          <button
            key={brand}
            type="button"
            className={styles.brand}
            data-brand={brand}
            aria-label={brand}
            title={brand}
            onClick={onSelect && (() => onSelect(brand))}
          >
            {logo ? (
              <svg className={styles.logo} viewBox={logo.viewBox} aria-hidden={true}>
                <g transform={logo.transform}>
                  {logo.d.map((d, i) => <path key={i} d={d} />)}
                </g>
              </svg>
            ) : (
              <span className={styles.wordmark} aria-hidden={true}>{brand}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
