import { BRAND_LOGOS } from './brandLogos';
import styles from './SupportedBrands.module.scss';

interface SupportedBrandsProps {
  /** Omitted for build-time HTML, where the host page wires clicks via data-brand. */
  onSelect?: (brand: string) => void;
  className?: string;
}

/** Brand logo buttons above the Supported Devices search. */
export function SupportedBrands({ onSelect, className }: SupportedBrandsProps) {
  return (
    <div className={[styles.brands, className].filter(Boolean).join(' ')}>
      {BRAND_LOGOS.map(logo => (
        <button
          key={logo.name}
          type="button"
          className={styles.brand}
          data-brand={logo.name}
          aria-label={logo.name}
          title={logo.name}
          onClick={onSelect && (() => onSelect(logo.name))}
        >
          <svg className={styles.logo} viewBox={logo.viewBox} aria-hidden={true}>
            {logo.paths.map((p, i) => (
              <path key={i} d={p.d} transform={p.transform} fillRule={p.evenOdd ? 'evenodd' : undefined} />
            ))}
          </svg>
        </button>
      ))}
    </div>
  );
}
