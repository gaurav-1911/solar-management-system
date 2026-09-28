import React from "react";
import "./StatCard.css";

const StatCard = ({ title, value, change, icon, color = "blue", loading = false }) => {
  const showChange = change != null && change !== 0;
  const isPositive = change >= 0;
  const isValueReady = value !== undefined && value !== null && value !== "";

  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className={`stat-icon stat-icon-${color}`}>
        {icon}
      </div>
      <div className="stat-content">
        <span className="stat-title">{title}</span>
        {loading || !isValueReady ? (
          <span className="stat-skeleton" />
        ) : (
          <span className="stat-value">{value}</span>
        )}
        {showChange && !loading && isValueReady && (
          <span className={`stat-change ${isPositive ? "stat-up" : "stat-down"}`}>
            {isPositive ? "+" : ""}{change}%
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              {isPositive ? (
                <polyline points="18 15 12 9 6 15" />
              ) : (
                <polyline points="6 9 12 15 18 9" />
              )}
            </svg>
            vs last month
          </span>
        )}
      </div>
    </div>
  );
};

export default StatCard;
