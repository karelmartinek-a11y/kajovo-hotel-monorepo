import React from 'react';

type Props = {
  title: string;
  description: string;
  action?: React.ReactNode;
  stateKey?: string;
};

export function StateView({ title, description, action, stateKey }: Props): JSX.Element {
  const testId = stateKey ? `state-view-${stateKey}` : 'state-view';

  return (
    <section className={`k-state-view ${stateKey ? `k-state-view--${stateKey}` : ''}`.trim()} data-testid={testId}>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="k-state-view-action">{action}</div> : null}
    </section>
  );
}
