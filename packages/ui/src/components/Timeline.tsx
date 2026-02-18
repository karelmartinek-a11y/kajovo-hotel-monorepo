import React from 'react';

export type TimelineEntry = {
  label: string;
  value: string;
  description?: string;
};

export function Timeline({ entries }: { entries: TimelineEntry[] }): JSX.Element {
  return (
    <ol className="k-timeline">
      {entries.map((entry) => (
        <li key={`${entry.label}-${entry.value}`} className="k-timeline-item">
          <div className="k-timeline-dot" aria-hidden="true" />
          <div>
            <div className="k-timeline-label">{entry.label}</div>
            <div className="k-timeline-value">{entry.value}</div>
            {entry.description ? <div className="k-timeline-description">{entry.description}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
