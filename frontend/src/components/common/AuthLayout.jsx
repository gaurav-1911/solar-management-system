import React from "react";
import "./AuthLayout.css";

import solarLogo from "../../assets/images/solar-logo-transparent.png";
import { Link } from "react-router-dom";

const AuthLayout = ({ children, brandTitle, brandSubtitle, features }) => {
  return (
    <div className="auth-wrapper">
      <div className="auth-left">
        <div className="auth-brand">
          <Link to="/" className="auth-brand-logo-link" title="Solar Management System - Gaurav Chavda">
            <img
              src={solarLogo}
              alt="Solar Management System - Gaurav Chavda"
              width="96"
              height="96"
              className="auth-brand-logo-img"
              loading="eager"
              decoding="async"
            />
          </Link>
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
