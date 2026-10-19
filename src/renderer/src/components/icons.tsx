/** Icons from design/mockup.html. */

export function EqIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3M1 15h6M9 8h6M17 17h6" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg
      className="chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      className="check-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5 10 17 19 7.5" />
    </svg>
  );
}

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const filled = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;

export function RefreshIcon() {
  return (
    <svg {...stroke}>
      <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
    </svg>
  );
}

export function MiniPlayerIcon() {
  return (
    <svg {...stroke} strokeLinecap="butt" strokeLinejoin="miter">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="12" y="12" width="7" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg {...stroke}>
      <path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z" />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg {...stroke}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function LikeIcon({ active }: { active: boolean }) {
  return (
    <svg {...stroke} fill={active ? 'currentColor' : 'none'}>
      <path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H7V10l4-8a3 3 0 0 1 3 3.9z" />
    </svg>
  );
}

export function PreviousIcon() {
  return (
    <svg {...filled}>
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg {...filled}>
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...filled}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...filled}>
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

/** Speaker with 0–2 waves depending on the volume, crossed out when muted. */
export function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  return (
    <svg {...stroke}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      {muted || volume === 0 ? (
        <path d="m16 9 5 6M21 9l-5 6" />
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          {volume > 0.5 && <path d="M19 5a10 10 0 0 1 0 14" />}
        </>
      )}
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg {...filled}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...stroke}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function PlaylistIcon() {
  return (
    <svg {...stroke}>
      <path d="M3 6h12M3 12h12M3 18h7M17 18V8l4-1" />
      <circle cx="15" cy="18" r="2" />
    </svg>
  );
}

/** Two people: friends & party (title bar "Social"). */
export function SocialIcon() {
  return (
    <svg {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.6a3.2 3.2 0 0 1 0 6.3M18 14.3c1.8.8 3 2.6 3 4.7" />
    </svg>
  );
}

/** Sound waves around a dot: the listening party. */
export function PartyIcon() {
  return (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...stroke}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
