import React from 'react';

type Props = {
  id: string;
  label: string;
  children: React.ReactNode;
};

export function FormField({ id, label, children }: Props): JSX.Element {
  return (
    <div className="k-form-field">
      <label htmlFor={id} className="k-form-field__label">{label}</label>
      {children}
    </div>
  );
}
