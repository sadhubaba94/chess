import type { JSX } from 'react';
import type { Color, PieceType } from '../../core/types';

/** Original geometric piece set drawn for Kingside (MIT licensed with the project). */
function shape(type: PieceType, detail: string): JSX.Element {
  switch (type) {
    case 'p':
      return (
        <>
          <path d="M17 31.5 19.6 22h5.8l2.6 9.5Z" />
          <rect x="17.6" y="20" width="9.8" height="2.6" rx="1.2" />
          <circle cx="22.5" cy="14.6" r="5.4" />
        </>
      );
    case 'r':
      return (
        <>
          <path d="M15.5 31.5 16.5 18h12l1 13.5Z" />
          <path d="M13 9.5h4v3h3v-3h5v3h3v-3h4V18H13Z" />
          <path d="M16.3 24h12.4" fill="none" stroke={detail} />
        </>
      );
    case 'b':
      return (
        <>
          <path d="M17.5 31.5c0-4.5 1.2-7.4 3-9.5h4c1.8 2.1 3 5 3 9.5Z" />
          <rect x="18.3" y="20.2" width="8.4" height="2.4" rx="1.1" />
          <path d="M22.5 8.2c-4.6 3.8-6.2 7.6-5.4 10.4.5 1.7 2.7 2.2 5.4 2.2s4.9-.5 5.4-2.2c.8-2.8-.8-6.6-5.4-10.4Z" />
          <circle cx="22.5" cy="6.4" r="1.9" />
          <path d="M24.6 12.2 21.4 16.6" fill="none" stroke={detail} />
        </>
      );
    case 'n':
      return (
        <>
          <path d="M14.5 31.5c-.2-4.6 1.6-7.6 5.2-10.3-2.6.5-4.9 1.6-6.6 3.2-1.6-.3-2.6-1.9-2-3.6 1.8-4.5 5.1-7.6 7.7-10.6l-.3-3.7 3.1 2.4c4.3-.3 7.8 1.4 9.8 4.6 2.2 3.6 2.7 9.4 1.9 18Z" />
          <circle cx="19.8" cy="14.6" r="1.1" fill={detail} stroke="none" />
          <path d="M27.5 13.5c1.6 2.6 2.1 6.2 1.6 10.5" fill="none" stroke={detail} />
        </>
      );
    case 'q':
      return (
        <>
          <path d="M15.5 31.5 11.6 16l5.6 6.2-.5-9 4.1 8.4 1.7-10 1.7 10 4.1-8.4-.5 9 5.6-6.2-3.9 15.5Z" />
          <circle cx="11.6" cy="14.4" r="1.9" />
          <circle cx="16.7" cy="11.6" r="1.9" />
          <circle cx="22.5" cy="9.6" r="1.9" />
          <circle cx="28.3" cy="11.6" r="1.9" />
          <circle cx="33.4" cy="14.4" r="1.9" />
          <path d="M16.2 27.6h12.6" fill="none" stroke={detail} />
        </>
      );
    case 'k':
      return (
        <>
          <path d="M15.5 31.5c-1.4-4.3-3.6-7.6-1.9-10.6 1.7-3 5.6-2.8 8.9.6 3.3-3.4 7.2-3.6 8.9-.6 1.7 3-.5 6.3-1.9 10.6Z" />
          <path d="M21.3 5.5h2.4v3h3v2.4h-3v6.6h-2.4v-6.6h-3V8.5h3Z" />
          <path d="M22.5 21.5v6M16.2 27.6h12.6" fill="none" stroke={detail} />
        </>
      );
  }
}

export function PieceIcon({ color, type, className }: { color: Color; type: PieceType; className?: string }) {
  const white = color === 'w';
  const detail = white ? '#24211d' : '#ece6da';
  return (
    <svg className={className} viewBox="0 1 45 43" aria-hidden="true" focusable="false">
      <g
        fill={white ? '#fbf8f2' : '#2a2827'}
        stroke={white ? '#24211d' : '#0b0a09'}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shape(type, detail)}
        <rect x="13.2" y="31.5" width="18.6" height="3.4" rx="1.1" />
        <rect x="10.5" y="34.6" width="24" height="4.6" rx="1.6" />
      </g>
    </svg>
  );
}
