import React from "react";
import "./AuthLayout.css";

const AuthLayout = ({ children, brandTitle, brandSubtitle, features }) => {
  return (
    <div className="auth-wrapper">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="10" fill="#FFD700" />
              <g stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round">
                <line x1="24" y1="2" x2="24" y2="8" />
                <line x1="24" y1="40" x2="24" y2="46" />
                <line x1="2" y1="24" x2="8" y2="24" />
                <line x1="40" y1="24" x2="46" y2="24" />
                <line x1="8.5" y1="8.5" x2="12.7" y2="12.7" />
                <line x1="35.3" y1="35.3" x2="39.5" y2="39.5" />
                <line x1="8.5" y1="39.5" x2="12.7" y2="35.3" />
                <line x1="35.3" y1="12.7" x2="39.5" y2="8.5" />
              </g>
            </svg>
          </div>
          <h1 className="auth-brand-title">{brandTitle}</h1>
          <p className="auth-brand-subtitle">{brandSubtitle}</p>
        </div>
        {features && features.length > 0 && (
          <div className="auth-features">
            {features.map((feature, index) => (
              <div className="auth-feature-item" key={index}>
                <div className="auth-feature-dot"></div>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="auth-right">
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
