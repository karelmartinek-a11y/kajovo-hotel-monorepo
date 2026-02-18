import React from 'react';

type Props = {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
};

export function DataTable({ headers, rows }: Props): JSX.Element {
  return (
    <div className="k-table-wrap" role="region" aria-label="Tabulka" tabIndex={0}>
      <table className="k-table">
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
