import React from 'react';
import { Icon } from './Icon';

type Props = {
  title: string;
  children: React.ReactNode;
  icon?: string;
  eyebrow?: string;
};

export function Card({ title, children, icon, eyebrow }: Props): JSX.Element {
  return (
    <section className="k-card">
      <div className="k-card__header">
        <div className="k-card__title-wrap">
          {eyebrow ? <p className="k-card__eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
        </div>
        {icon ? <Icon name={icon} className="k-card__icon" title={title} /> : null}
      </div>
      <div className="k-card__body">{children}</div>
    </section>
  );
}
