import React from "react";
import TableLoader from "./TableLoader";
import { TableEmptyState } from "./EmptyState";
import "./DataTable.css";

/**
 * Reusable DataTable Component
 * 
 * Standardizes responsive table containers, horizontal scrolling, loading states,
 * and empty states across all administration and data listing pages.
 * 
 * Supports both structured column configuration or direct JSX children.
 * 
 * @param {Object} props
 * @param {Array<Object>} [props.columns] Column definitions [{ key, header, render, className }]
 * @param {Array<Object>} [props.data] Data rows array
 * @param {boolean} [props.loading=false] Loading state indicator
 * @param {string} [props.emptyTitle="No records found"] Empty state title
 * @param {string} [props.emptySubtitle="Try adjusting your filters or adding a new record."] Empty state subtitle
 * @param {number} [props.colSpan=6] Column span for loader and empty state
 * @param {React.ReactNode} [props.pagination] Optional Pagination component rendered in the card footer
 * @param {React.ReactNode} [props.children] Direct table markup if not using columns/data props
 * @param {string} [props.className=""] Additional CSS classes for the card container
 * @param {string} [props.tableClassName=""] Additional CSS classes for the table
 */
const DataTable = ({
  columns,
  data,
  loading = false,
  emptyTitle = "No records found",
  emptySubtitle = "Try adjusting your filters or adding a new record.",
  colSpan = 6,
  pagination,
  children,
  className = "",
  tableClassName = "",
}) => {
  const isDirectChildren = Boolean(children);
  const isEmpty = !loading && Array.isArray(data) && data.length === 0;

  return (
    <div className={`data-table-card ${className}`.trim()}>
      <div className="data-table-wrapper">
        <table className={`data-table ${tableClassName}`.trim()}>
          {isDirectChildren ? (
            children
          ) : (
            <>
              {columns && (
                <thead>
                  <tr>
                    {columns.map((col, idx) => (
                      <th key={col.key || idx} className={col.className || ""}>
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {loading ? (
                  <TableLoader colSpan={columns?.length || colSpan} />
                ) : isEmpty ? (
                  <TableEmptyState
                    colSpan={columns?.length || colSpan}
                    title={emptyTitle}
                    subtitle={emptySubtitle}
                  />
                ) : (
                  data?.map((row, rowIdx) => (
                    <tr key={row.id || row._id || rowIdx}>
                      {columns.map((col, colIdx) => (
                        <td key={col.key || colIdx} className={col.className || ""}>
                          {col.render
                            ? col.render(row[col.key], row, rowIdx)
                            : row[col.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}
        </table>
      </div>

      {pagination && <div className="data-table-footer">{pagination}</div>}
    </div>
  );
};

export default DataTable;
