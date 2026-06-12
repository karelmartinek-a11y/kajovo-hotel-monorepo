import React from 'react';

type Props = {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
  caption?: string;
};

export function DataTable({ headers, rows, caption = 'Tabulka' }: Props): JSX.Element {
  return (
    <div className="k-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="k-table">
        <caption className="k-nav-sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
