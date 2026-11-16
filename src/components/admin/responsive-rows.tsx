import type { ReactNode } from 'react';
import { AdminList, AdminListItem } from './list';

export type DisplayRow = { id: string; cells: ReactNode[] };
/** Küçük ekranda etiketli kartlar, geniş ekranda aynı veriden tablo. */
export function ResponsiveRows({
  headers,
  rows,
  columnWidths,
}: {
  headers: string[];
  rows: DisplayRow[];
  columnWidths?: string[];
}) {
  return (
    <>
      <AdminList className="lg:hidden">
        {rows.map((row) => (
          <AdminListItem key={row.id}>
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
          </AdminListItem>
        ))}
      </AdminList>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface shadow-card lg:block">
        <table className="w-full table-fixed border-collapse text-left [overflow-wrap:anywhere]">
          {columnWidths && (
            <colgroup>
              {headers.map((header, index) => (
                <col key={header} style={{ width: columnWidths[index] }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr className="border-b border-border bg-surface-strong text-sm text-fg-muted">
              {headers.map((header) => (
                <th scope="col" className="px-4 py-3 font-medium last:text-right" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-border last:border-0" key={row.id}>
                {row.cells.map((cell, index) => (
                  <td
                    className="break-words px-4 py-4 align-top last:text-right last:[&>div]:justify-end"
                    key={`${row.id}-${index}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
