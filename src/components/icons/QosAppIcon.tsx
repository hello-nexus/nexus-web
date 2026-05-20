// 32x32 stylised Qos device-with-cables icon. Used in the PairRedirect
// landing page and the OpenInAppBanner; centralised here so the artwork has
// one source of truth.
export function QosAppIcon({ size = 32, boltFill = '#0a0a10' }: { size?: number; boltFill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="4" width="20" height="24" rx="3" fill="currentColor" />
      <rect x="2" y="9" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="2" y="14.75" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="2" y="20.5" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="25" y="9" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="25" y="14.75" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="25" y="20.5" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <path d="M18.5 7L10 17h5l-1.5 8L22 15h-5l1.5-8z" fill={boltFill} />
    </svg>
  );
}
