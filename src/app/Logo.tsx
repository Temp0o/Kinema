/** Kinema brand mark: a "K" whose arms are motion trails. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="kg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B49BFF" />
          <stop offset="0.45" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#kg)" />
      <rect x="8" y="7" width="4.2" height="18" rx="2.1" fill="#fff" />
      <path d="M13.5 16.2 L21.6 8.1" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M15.4 15.4 L22.6 24.2" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M24.5 12.2 L26 10.7" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      <path d="M25.6 20.6 L26.8 22.1" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650, fontSize: 14, letterSpacing: '-0.01em' }}>
      <LogoMark />
      Kinema
    </span>
  );
}
