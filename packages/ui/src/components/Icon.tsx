import React from 'react';

type IconProps = {
  name?: string | null;
  className?: string;
  title?: string;
};

function pathFor(name?: string | null): JSX.Element {
  switch (name) {
    case 'layout-dashboard':
      return (
        <>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </>
      );
    case 'utensils':
      return (
        <>
          <path d="M7 3v7" />
          <path d="M5 3v4a2 2 0 0 0 4 0V3" />
          <path d="M17 3v18" />
          <path d="M17 3c2 2 2 5 0 7" />
        </>
      );
    case 'tool':
      return (
        <>
          <path d="M14 5a4 4 0 0 0 5 5l-7.5 7.5a2 2 0 1 1-2.8-2.8L16.2 7.2A4 4 0 0 0 14 5Z" />
          <path d="m5 19 2-2" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </>
      );
    case 'boxes':
      return (
        <>
          <path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z" />
          <path d="M3 12.5 12 17l9-4.5" />
          <path d="M3 17.5 12 22l9-4.5" />
          <path d="M12 7.5V22" />
        </>
      );
    case 'file-text':
      return (
        <>
          <path d="M8 3h6l5 5v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h6" />
        </>
      );
    case 'grid':
      return (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </>
      );
    case 'briefcase':
      return (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </>
      );
    case 'folder':
      return <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z" />;
    case 'users':
      return (
        <>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M4 19a5 5 0 0 1 10 0" />
          <path d="M14.5 19a4 4 0 0 1 5-3.5" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3.7a7 7 0 0 0-1.8-1L14.5 3h-5l-.3 2.8a7 7 0 0 0-1.8 1l-2.3-.7-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.7a7 7 0 0 0 1.8 1l.4 2.8h5l.3-2.8a7 7 0 0 0 1.8-1l2.3.7 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
        </>
      );
    case 'profile':
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </>
      );
    default:
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </>
      );
  }
}

export function Icon({ name, className, title }: IconProps): JSX.Element {
  return (
    <span className={className ?? 'k-icon'} aria-hidden={title ? undefined : 'true'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : 'presentation'}>
        {title ? <title>{title}</title> : null}
        {pathFor(name)}
      </svg>
    </span>
  );
}
