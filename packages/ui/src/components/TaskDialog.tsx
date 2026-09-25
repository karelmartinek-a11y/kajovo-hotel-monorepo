import React from 'react';
import { t } from '@kajovo/shared';

/** Native modal semantics keep focus and pointer interaction inside the active task. */
export function TaskDialog({ title, children, busy = false, onClose, className = '' }: {
  title: string;
  children: React.ReactNode;
  busy?: boolean;
  onClose: () => void;
  className?: string;
}): JSX.Element {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`k-task-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="k-task-dialog__header">
      <h2 id={titleId}>{title}</h2>
      {!busy ? <button type="button" className="k-task-close" aria-label={t("Zavřít dialog")} onClick={onClose}>×</button> : null}
    </header>
    {children}
  </dialog>;
}
