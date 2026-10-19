/** Pegel logo: four level bars in the accent colour (from design/mockup.html). */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="10" width="3.2" height="10" rx="1.6" fill="var(--accent)" />
      <rect x="7.6" y="4" width="3.2" height="16" rx="1.6" fill="var(--accent)" />
      <rect x="13.2" y="8" width="3.2" height="12" rx="1.6" fill="var(--accent)" opacity=".75" />
      <rect x="18.8" y="13" width="3.2" height="7" rx="1.6" fill="var(--accent)" opacity=".5" />
    </svg>
  );
}
