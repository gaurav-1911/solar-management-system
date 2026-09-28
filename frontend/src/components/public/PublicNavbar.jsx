import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import solarLogo from "../../assets/images/solar-logo-transparent.png";
import "./PublicNavbar.css";

export const PublicNavbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className={`public-header ${scrolled ? "scrolled" : ""}`}>
      <div className="public-header-container">
        <Link to="/" className="public-brand-logo" onClick={closeMenu} title="Solar Management System - Gaurav Chavda">
          <img
            src={solarLogo}
            alt="Solar Management System - Gaurav Chavda"
            width="160"
            height="44"
            className="brand-logo-img"
            loading="eager"
            decoding="async"
          />
        </Link>

        <nav className={`public-nav ${mobileMenuOpen ? "open" : ""}`} aria-label="Main Navigation">
          <Link
            to="/"
            className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
            onClick={closeMenu}
          >
            Home
          </Link>
          <a href="#features" className="nav-link" onClick={closeMenu}>
            Features
          </a>
          <a href="#how-it-works" className="nav-link" onClick={closeMenu}>
            How It Works
          </a>
          <a href="#benefits" className="nav-link" onClick={closeMenu}>
            Benefits
          </a>
          <a href="#faq" className="nav-link" onClick={closeMenu}>
            FAQ
          </a>
          <Link
            to="/about"
            className={`nav-link ${location.pathname === "/about" ? "active" : ""}`}
            onClick={closeMenu}
          >
            About Gaurav Chavda
          </Link>
          <a href="#contact" className="nav-link" onClick={closeMenu}>
            Contact
          </a>

          <div className="nav-actions-mobile">
            <Link to="/login" className="btn-nav-login" onClick={closeMenu}>
              Sign In
            </Link>
          </div>
        </nav>

        <div className="public-header-actions">
          <Link to="/login" className="btn-nav-login">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span>Sign In</span>
          </Link>

          <button
            type="button"
            className="mobile-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className={`hamburger-bar ${mobileMenuOpen ? "open" : ""}`}></span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default PublicNavbar;
