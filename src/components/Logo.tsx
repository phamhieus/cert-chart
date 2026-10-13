import { useId } from 'react';

/**
 * A softly shadowed card holding three podium steps and a seal over the winner.
 * public/favicon.svg draws the same mark without the card, larger, so it stays
 * legible at 16px in a browser tab — change the two together.
 */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  // Two logos on one page must not share a filter id.
  const shadowId = `logo-shadow-${useId().replace(/:/g, '')}`;

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Soft and short: the card should sit on the page, not float above it. */}
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.3" floodColor="#000" floodOpacity="0.22" />
        </filter>
      </defs>
      <rect
        className="fill-elevated"
        x="3"
        y="3"
        width="26"
        height="26"
        rx="6"
        filter={`url(#${shadowId})`}
      />
      <g className="stroke-ink" strokeWidth={1.8} strokeLinecap="round">
        <path d="M11 23.5v-5" />
        <path d="M16 23.5v-8" />
        <path d="M21 23.5v-3" />
      </g>
      <circle className="stroke-accent" cx="16" cy="10.4" r="2.4" strokeWidth={1.5} />
    </svg>
  );
}
