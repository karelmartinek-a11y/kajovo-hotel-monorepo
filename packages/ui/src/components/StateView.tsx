import React from 'react';
import { Icon } from './Icon';

type Props = {
  title: string;
  description: string;
  action?: React.ReactNode;
  stateKey?: string;
};

function liveRegionProps(stateKey?: string): { role?: 'alert'; ariaLive: 'assertive' | 'polite' } {
  if (!stateKey) {
    return { ariaLive: 'polite' };
  }
  const assertiveStates = new Set(['error', 'offline', 'maintenance', '404']);
  if (assertiveStates.has(stateKey)) {
    return { role: 'alert', ariaLive: 'assertive' };
  }
  return { ariaLive: 'polite' };
}

export function StateView({ title, description, action, stateKey }: Props): JSX.Element {
  const testId = stateKey ? `state-view-${stateKey}` : 'state-view';
  const { role, ariaLive } = liveRegionProps(stateKey);
  const iconName =
    stateKey === 'error' || stateKey === '404'
      ? 'file-text'
      : stateKey === 'offline' || stateKey === 'maintenance'
        ? 'tool'
        : stateKey === 'empty'
          ? 'folder'
          : 'layout-dashboard';

  return (
    <section
      className={`k-state-view ${stateKey ? `k-state-view--${stateKey}` : ''}`.trim()}
      data-testid={testId}
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
    >
      <span className="k-state-view__icon-wrap">
        <Icon name={iconName} className="k-state-view__icon" title={title} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="k-state-view-action">{action}</div> : null}
    </section>
  );
}
