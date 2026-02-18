import React from 'react';

type Props = {
  title: string;
  children: React.ReactNode;
};

export function Card({ title, children }: Props): JSX.Element {
  return (
    <section className="k-card">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}
