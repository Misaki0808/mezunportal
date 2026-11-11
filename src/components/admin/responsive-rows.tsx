import type { ReactNode } from 'react';

export type DisplayRow = { id: string; cells: ReactNode[] };
/** Küçük ekranda etiketli kartlar, geniş ekranda aynı veriden tablo. */
export function ResponsiveRows({ headers, rows }: { headers: string[]; rows: DisplayRow[] }) {
  return (
    <>
      <ul className="flex min-w-0 flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="min-w-0 rounded-card border border-border p-5 shadow-card">
            <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
              {row.cells.map((cell, index) => (
                // İlk hücre kart başlığı, son hücre eylem alanı gibi tam genişlik; ortadakiler iki sütuna iner (kart kısalır).
                <div
                  key={`${row.id}-${index}`}
                  className={
                    index === 0 || index === row.cells.length - 1 ? 'col-span-2 min-w-0' : 'min-w-0'
                  }
                >
                  <dt className="text-sm font-medium text-fg-muted">{headers[index]}</dt>
                  <dd className="mt-1 text-base [overflow-wrap:anywhere]">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <table className="hidden w-full table-fixed border-collapse text-left [overflow-wrap:anywhere] lg:table">
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
