import React from 'react';

type Props = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function StateView({ title, description, action }: Props): JSX.Element {
  return (
    <section className="k-state-view" data-testid="state-view">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
