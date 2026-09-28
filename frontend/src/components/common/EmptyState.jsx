import React from "react";
import "./EmptyState.css";

const DefaultPulseIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

/**
 * Standalone EmptyState component
 */
export const EmptyState = ({
  title = "No records found",
  subtitle = "Try adjusting your search or filters.",
  icon,
  action,
}) => {
  return (
    <div className="table-empty-container">
      <div className="table-empty-icon">{icon || <DefaultPulseIcon />}</div>
      <h4 className="table-empty-title">{title}</h4>
      <p className="table-empty-subtitle">{subtitle}</p>
      {action && <div className="table-empty-action">{action}</div>}
    </div>
  );
};

/**
 * TableEmptyState component for rendering inside <tbody>
 */
export const TableEmptyState = ({
  colSpan = 10,
  title = "No records found",
  subtitle = "Try adjusting your search or filters.",
  icon,
  action,
}) => {
  return (
    <tr className="table-empty-row">
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <EmptyState title={title} subtitle={subtitle} icon={icon} action={action} />
      </td>
    </tr>
  );
};

export default EmptyState;
