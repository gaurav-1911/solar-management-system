import React from "react";
import "./PageHeader.css";

/**
 * Reusable PageHeader Component
 * 
 * Standardizes the page title, description, and action button container
 * across all admin and operational modules.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.title Page heading title
 * @param {React.ReactNode} [props.description] Explanatory page subtitle/description
 * @param {React.ReactNode} [props.subtitle] Alias for description
 * @param {React.ReactNode} [props.actions] Action buttons (e.g. Add, Export, Filter)
 * @param {React.ReactNode} [props.children] Additional actions or content
 * @param {React.ReactNode} [props.breadcrumbs] Optional breadcrumb trail
 * @param {string} [props.className=""] Additional CSS classes
 */
const PageHeader = ({
  title,
  description,
  subtitle,
  actions,
  children,
  breadcrumbs,
  className = "",
}) => {
  const desc = description || subtitle;
  const headerActions = actions || children;

  return (
    <header className={`page-header ${className}`.trim()}>
      {breadcrumbs && <div className="page-header-breadcrumbs">{breadcrumbs}</div>}

      <div className="page-header-main">
        <div className="page-header-content">
          {typeof title === "string" ? (
            <h2 className="page-header-title">{title}</h2>
          ) : (
            title
          )}
          {desc && (
            <p className="page-header-desc">
              {desc}
            </p>
          )}
        </div>

        {headerActions && (
          <div className="page-header-actions">
            {headerActions}
          </div>
        )}
      </div>
    </header>
  );
};

export default PageHeader;
