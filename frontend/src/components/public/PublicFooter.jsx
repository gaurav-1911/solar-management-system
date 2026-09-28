import React from "react";
import { Link } from "react-router-dom";
import solarLogo from "../../assets/images/solar-logo-transparent.png";
import { SITE_CONFIG } from "../../config/seo.config";
import "./PublicFooter.css";

export const PublicFooter = () => {
  return (
    <footer className="public-footer" role="contentinfo">
      <div className="public-footer-top">
        <div className="public-footer-container">
          {/* Column 1: Brand & Creator */}
          <div className="footer-col footer-col-brand">
            <Link to="/" className="footer-logo-link" title="Solar Management System - Gaurav Chavda">
              <img
                src={solarLogo}
                alt="Solar Management System - Gaurav Chavda"
                width="180"
                height="50"
                className="footer-logo-img"
                loading="lazy"
                decoding="async"
              />
            </Link>
            <p className="footer-desc">
              Enterprise <strong>Solar Management System</strong>, real-time IoT monitoring, and CRM architected by{" "}
              <strong>Gaurav Chavda</strong> (also known as <em>Chavda Gaurav</em>) in <strong>Rajkot, Gujarat, India</strong>.
            </p>
            <div className="footer-social-links">
              <a href={SITE_CONFIG.socialLinks.github} target="_blank" rel="noopener noreferrer" aria-label="Gaurav Chavda GitHub" className="social-icon-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              </a>
              <a href={SITE_CONFIG.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label="Gaurav Chavda LinkedIn" className="social-icon-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
              </a>
              <a href={SITE_CONFIG.socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="Gaurav Chavda Twitter" className="social-icon-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.954 4.569c-.885.389-1.83.654-2.825.775 1.014-.611 1.794-1.574 2.163-2.723-.951.555-2.005.959-3.127 1.184-.896-.959-2.173-1.559-3.591-1.559-2.717 0-4.92 2.203-4.92 4.917 0 .39.045.765.127 1.124C7.691 8.094 4.066 6.13 1.64 3.161c-.427.722-.666 1.561-.666 2.475 0 1.71.87 3.213 2.188 4.096-.807-.026-1.566-.248-2.228-.616v.061c0 2.385 1.693 4.374 3.946 4.827-.413.111-.849.171-1.296.171-.314 0-.615-.03-.916-.086.631 1.953 2.445 3.377 4.604 3.417-1.68 1.319-3.809 2.105-6.102 2.105-.39 0-.779-.023-1.17-.067 2.18 1.394 4.768 2.209 7.557 2.209 9.054 0 13.999-7.496 13.999-13.986 0-.209 0-.42-.015-.63.961-.689 1.8-1.56 2.46-2.548l-.047-.02z"/></svg>
              </a>
            </div>
          </div>

          {/* Column 2: Product Features */}
          <div className="footer-col">
            <h3 className="footer-heading">Solar ERP Modules</h3>
            <ul className="footer-links">
              <li><a href="#features">Real-Time Solar Generation</a></li>
              <li><a href="#features">Instant Quotation Engine</a></li>
              <li><a href="#features">Field Technician Dispatch</a></li>
              <li><a href="#features">Rooftop 3D Site Surveys</a></li>
              <li><a href="#features">PM Surya Ghar Subsidy Tracker</a></li>
              <li><a href="#features">Multi-Warehouse Inventory</a></li>
              <li><a href="#features">Preventive AMC &amp; Warranty</a></li>
            </ul>
          </div>

          {/* Column 3: Navigation & Creator */}
          <div className="footer-col">
            <h3 className="footer-heading">Company &amp; Creator</h3>
            <ul className="footer-links">
              <li><Link to="/about">About Gaurav Chavda</Link></li>
              <li><a href="#how-it-works">How System Works</a></li>
              <li><a href="#benefits">EPC Benefits &amp; ROI</a></li>
              <li><a href="#faq">Frequently Asked Questions</a></li>
              <li><a href="#calculator">Solar ROI Calculator</a></li>
              <li><Link to="/login">Admin Login Portal</Link></li>
              <li><a href="#contact">Contact &amp; Support</a></li>
            </ul>
          </div>

          {/* Column 4: Contact & Technical SEO */}
          <div className="footer-col">
            <h3 className="footer-heading">Location &amp; Compliance</h3>
            <div className="footer-contact-info">
              <p>📍 <strong>Rajkot, Gujarat, India</strong></p>
              <p>✉️ <a href={`mailto:${SITE_CONFIG.contactEmail}`}>{SITE_CONFIG.contactEmail}</a></p>
              <p>📞 {SITE_CONFIG.phone}</p>
            </div>
            <h4 className="footer-subheading">Technical SEO Files</h4>
            <ul className="footer-links-small">
              <li><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">sitemap.xml</a></li>
              <li><a href="/robots.txt" target="_blank" rel="noopener noreferrer">robots.txt</a></li>
              <li><a href="/security.txt" target="_blank" rel="noopener noreferrer">security.txt</a></li>
              <li><a href="/humans.txt" target="_blank" rel="noopener noreferrer">humans.txt</a></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="public-footer-bottom">
        <div className="public-footer-container bottom-flex">
          <p className="copyright-text">
            © {new Date().getFullYear()} <strong>Solar Management System</strong>. Designed &amp; Developed by{" "}
            <strong>Gaurav Chavda</strong> (Chavda Gaurav), Rajkot, Gujarat, India. All rights reserved.
          </p>
          <div className="footer-badges">
            <span className="badge-item">⚡ 100% Green Tech</span>
            <span className="badge-item">🛡️ Enterprise Security</span>
            <span className="badge-item">📍 Made in Gujarat, India</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
