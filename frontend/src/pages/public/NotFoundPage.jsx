import React from "react";
import { Link } from "react-router-dom";
import PublicNavbar from "../../components/public/PublicNavbar";
import PublicFooter from "../../components/public/PublicFooter";
import SEOHead from "../../components/common/SEOHead";
import "./NotFoundPage.css";

export const NotFoundPage = () => {
  return (
    <div className="not-found-page-root">
      <SEOHead pageKey="notFound" />
      <PublicNavbar />

      <main id="main-content" className="not-found-main">
        <div className="page-container not-found-container">
          <div className="not-found-code">404</div>
          <h1 className="not-found-title">Page Not Found</h1>
          <p className="not-found-desc">
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
          </p>

          <div className="not-found-actions">
            <Link to="/" className="btn-primary-hero">
              ← Return to Home
            </Link>
            <Link to="/about" className="btn-secondary-hero">
              About Gaurav Chavda
            </Link>
            <Link to="/login" className="btn-secondary-hero">
              Sign In to Dashboard
            </Link>
          </div>

          <div className="not-found-helpful-links">
            <p>Popular destinations:</p>
            <div className="helpful-pills">
              <a href="/#features">Core Features</a>
              <a href="/#how-it-works">How It Works</a>
              <a href="/#calculator">Solar ROI Calculator</a>
              <a href="/#faq">FAQ</a>
              <a href="/#contact">Contact</a>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default NotFoundPage;
