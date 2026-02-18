import React from 'react';

type BadgeTone = 'neutral' | 'danger' | 'success' | 'info' | 'warning';

type BadgeProps = {
  children: React.ReactNode;
  tone?: BadgeTone;
};

export function Badge({ children, tone = 'neutral' }: BadgeProps): JSX.Element {
  return <span className={`k-badge k-badge--${tone}`}>{children}</span>;
}
