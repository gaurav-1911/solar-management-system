import React from "react";
import { Link } from "react-router-dom";
import PublicNavbar from "../../components/public/PublicNavbar";
import PublicFooter from "../../components/public/PublicFooter";
import SEOHead from "../../components/common/SEOHead";
import { SITE_CONFIG } from "../../config/seo.config";
import solarLogo from "../../assets/images/solar-logo-transparent.png";
import "./AboutPage.css";

export const AboutPage = () => {
  return (
    <div className="about-page-root">
      <SEOHead pageKey="about" />
      <PublicNavbar />

      <main id="main-content" className="about-main">
        {/* ========== BREADCRUMB & HEADER ========== */}
        <section className="about-hero" aria-labelledby="about-heading">
          <div className="page-container">
            <nav className="breadcrumb-nav" aria-label="Breadcrumb">
              <ol className="breadcrumb-list">
                <li><Link to="/">Home</Link></li>
                <li className="sep">/</li>
                <li aria-current="page">About Gaurav Chavda</li>
              </ol>
            </nav>

            <span className="section-tag">Engineer &amp; Architect Profile</span>
            <h1 id="about-heading" className="about-title">
              About Gaurav Chavda <br />
              <span className="text-gradient">Creator of Solar Management System</span>
            </h1>
            <p className="about-tagline">
              Senior Full-Stack Engineer &amp; Solar Software Architect based in <strong>Rajkot, Gujarat, India</strong>.
            </p>
          </div>
        </section>

        {/* ========== MAIN BIO & STORY ========== */}
        <section className="section-block about-content-section">
          <div className="page-container">
            <div className="about-grid">
              <article className="about-bio-article">
                <h2>Who is Gaurav Chavda (Chavda Gaurav)?</h2>
                <p>
                  <strong>Gaurav Chavda</strong> (also frequently searched and known professionally as <strong>Chavda Gaurav</strong>) is a seasoned full-stack engineer and renewable software technologist headquartered in <strong>Rajkot, Gujarat, India</strong>.
                </p>
                <p>
                  With years of hands-on experience building mission-critical web applications, enterprise dashboards, and distributed systems, Gaurav has dedicated his architectural expertise to revolutionizing the renewable energy sector in India. His flagship creation, the <strong>Solar Management System (Solar PMS)</strong>, is an enterprise-grade platform tailored to meet the operational, technical, and regulatory requirements of commercial, industrial, and rooftop solar installations.
                </p>

                <h2>The Genesis of Solar Management System</h2>
                <p>
                  Gujarat has long been recognized as the solar capital of India, with pioneering installations across Rajkot, Ahmedabad, Surat, and Kutch. However, as rooftop solar adoption accelerated under schemes such as the <strong>PM Surya Ghar Muft Bijli Yojana</strong>, solar EPC companies faced severe operational fragmentation:
                </p>
                <ul className="about-list">
                  <li><strong>Disconnected Site Surveys:</strong> Shadow analysis, azimuth measurements, and roof photographs were scattered across paper notebooks and messaging apps.</li>
                  <li><strong>Slow Quotation Turnarounds:</strong> Generating complex bill of materials (BOM), subsidy calculations, and return on investment (ROI) sheets took hours.</li>
                  <li><strong>Lack of Real-time Visibility:</strong> Once commissioned, plant owners and EPCs had no unified dashboard to detect inverter clipping or string faults.</li>
                  <li><strong>Technician &amp; AMC Delays:</strong> Dispatching service engineers for periodic cleaning and warranty issues lacked GPS verification and automated scheduling.</li>
                </ul>
                <p>
                  To solve these industry bottlenecks, <strong>Gaurav Chavda</strong> engineered the <strong>Solar Management System</strong> as a unified, cloud-ready software suite integrating CRM, telemetry, inventory, logistics, technician dispatch, and GST billing into a cohesive platform.
                </p>

                <h2>Technical Architecture &amp; Engineering Stack</h2>
                <p>
                  Engineered with a focus on high throughput, zero-latency state management, and strict role-based access control (RBAC), the platform utilizes:
                </p>
                <div className="tech-stack-cards">
                  <div className="tech-card">
                    <h3>Frontend Architecture</h3>
                    <p>React 19, Vite, TanStack Query, Leaflet GIS mapping, Recharts data visualization, and Vanilla CSS design tokens for optimal Core Web Vitals.</p>
                  </div>
                  <div className="tech-card">
                    <h3>Backend &amp; API Layer</h3>
                    <p>Node.js &amp; Express RESTful micro-architecture, JWT token rotation, bcrypt cryptographic security, Helmet protection, and rate-limiting.</p>
                  </div>
                  <div className="tech-card">
                    <h3>Database &amp; Storage</h3>
                    <p>MongoDB Atlas with distributed replica clusters, indexing, and Cloudinary media pipelines for high-resolution site survey images.</p>
                  </div>
                  <div className="tech-card">
                    <h3>IoT &amp; Telemetry</h3>
                    <p>Real-time energy generation telemetry ingestion, automated health checks, and DISCOM net-metering compliance verification.</p>
                  </div>
                </div>

                <h2>Vision for Renewable Energy in India</h2>
                <p>
                  Gaurav's mission is to empower over 1,000+ solar installers, EPCs, and clean energy developers across Gujarat and India with digital tools that accelerate green energy adoption. By combining software automation with renewable engineering, the Solar Management System eliminates administrative friction so engineers can focus on generating clean energy.
                </p>
              </article>

              {/* Sidebar Profile Card */}
              <aside className="about-sidebar">
                <div className="profile-card">
                  <img
                    src={solarLogo}
                    alt="Solar Management System - Gaurav Chavda"
                    width="180"
                    height="180"
                    className="profile-logo-img"
                    loading="eager"
                  />
                  <h3 className="profile-name">Gaurav Chavda</h3>
                  <p className="profile-alias">Chavda Gaurav</p>
                  <p className="profile-title">{SITE_CONFIG.authorJobTitle}</p>
                  <div className="profile-meta">
                    <div className="meta-item">
                      <span className="meta-icon">📍</span>
                      <span>Rajkot, Gujarat, India</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-icon">✉️</span>
                      <a href={`mailto:${SITE_CONFIG.contactEmail}`}>{SITE_CONFIG.contactEmail}</a>
                    </div>
                    <div className="meta-item">
                      <span className="meta-icon">📞</span>
                      <span>{SITE_CONFIG.phone}</span>
                    </div>
                  </div>

                  <div className="profile-social-buttons">
                    <a href={SITE_CONFIG.socialLinks.github} target="_blank" rel="noopener noreferrer" className="btn-social">
                      GitHub (@gaurav-1911)
                    </a>
                    <a href={SITE_CONFIG.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="btn-social">
                      LinkedIn Profile
                    </a>
                  </div>

                  <hr className="profile-divider" />

                  <div className="profile-cta">
                    <Link to="/login" className="btn-launch-app">
                      Access Solar Dashboard →
                    </Link>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default AboutPage;
