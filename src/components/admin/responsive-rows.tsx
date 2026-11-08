import type { ReactNode } from 'react';

export type DisplayRow = { id: string; cells: ReactNode[] };
/** Küçük ekranda etiketli kartlar, geniş ekranda aynı veriden tablo. */
export function ResponsiveRows({ headers, rows }: { headers: string[]; rows: DisplayRow[] }) {
  return (
    <>
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-card border border-border p-5 shadow-card">
            <dl className="grid gap-3">
              {row.cells.map((cell, index) => (
                <div key={`${row.id}-${index}`}>
                  <dt className="text-sm font-medium text-fg-muted">{headers[index]}</dt>
                  <dd className="mt-1 break-words text-base">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <table className="hidden w-full border-collapse text-left lg:table">
        <thead>
          <tr className="border-b border-border">
            {headers.map((header) => (
              <th className="p-3" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border" key={row.id}>
              {row.cells.map((cell, index) => (
                <td className="break-words p-3 align-top" key={`${row.id}-${index}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
