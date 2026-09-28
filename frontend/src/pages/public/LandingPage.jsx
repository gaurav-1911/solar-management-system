import React, { useState } from "react";
import { Link } from "react-router-dom";
import PublicNavbar from "../../components/public/PublicNavbar";
import PublicFooter from "../../components/public/PublicFooter";
import SolarCalculator from "../../components/public/SolarCalculator";
import SEOHead from "../../components/common/SEOHead";
import { FAQ_DATA, SITE_CONFIG } from "../../config/seo.config";
import solarLogo from "../../assets/images/solar-logo-transparent.png";
import "./LandingPage.css";

export const LandingPage = () => {
  const [activeFaq, setActiveFaq] = useState(null);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: ""
  });

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    setContactSubmitted(true);
  };

  const features = [
    {
      icon: "⚡",
      title: "Real-Time Solar Telemetry",
      desc: "Live inverter metrics, string monitoring, power generation curves (kW/kWh), and automated fault alerts for zero-downtime plant operations."
    },
    {
      icon: "📑",
      title: "Automated Quotation Engine",
      desc: "Generate professional branded solar proposals, bill of materials (BOM), payback timelines, and PDF quotations in seconds."
    },
    {
      icon: "🛰️",
      title: "Rooftop 3D Site Survey",
      desc: "Capture GPS coordinates, roof azimuth angles, tilt measurements, shading analysis, and customer roof photos directly on mobile."
    },
    {
      icon: "📍",
      title: "Technician Dispatch & Tracking",
      desc: "Assign field engineers, track GPS attendance, record daily work progress logs, and log material consumption on site."
    },
    {
      icon: "🏛️",
      title: "PM Surya Ghar Subsidy Tracker",
      desc: "End-to-end documentation workflow for Indian DISCOM net metering, feasibility approvals, and direct subsidy disbursement."
    },
    {
      icon: "📦",
      title: "Multi-Warehouse Inventory",
      desc: "Real-time stock management for solar panels, inverters, structure rails, meters, cables, and automated re-order triggers."
    },
    {
      icon: "🛡️",
      title: "Preventive AMC & Warranty",
      desc: "Scheduled periodic maintenance visits, panel cleaning logs, inverter warranty claims, and automated customer service tickets."
    },
    {
      icon: "💳",
      title: "GST Billing & Milestones",
      desc: "Custom milestone payment schedules, automated GST invoice generation, receipts, and customer payment gateway integrations."
    }
  ];

  const steps = [
    {
      num: "01",
      title: "Lead Capture & Site Survey",
      desc: "Log customer inquiries, auto-assign survey engineers, and conduct on-site rooftop measurement & shadow analysis."
    },
    {
      num: "02",
      title: "Design & Instant Quotation",
      desc: "Configure optimum panel capacity, inverter sizing, PM Surya Ghar subsidy calculations, and send instant customer proposals."
    },
    {
      num: "03",
      title: "Installation & Net-Metering",
      desc: "Dispatch field technicians with material requisitions, track daily installation progress, and manage DISCOM liaison."
    },
    {
      num: "04",
      title: "IoT Monitoring & AMC Care",
      desc: "Continuous real-time solar generation tracking, automatic fault warnings, preventive servicing, and warranty lifecycle management."
    }
  ];

  return (
    <div className="landing-page-root">
      <SEOHead pageKey="home" />
      <PublicNavbar />

      <main id="main-content">
        {/* ========== HERO SECTION ========== */}
        <section className="hero-section" aria-labelledby="hero-heading">
          <div className="hero-bg-glow"></div>
          <div className="page-container hero-container">
            <div className="hero-badge">
              <span className="pulse-dot"></span>
              <span>Enterprise Solar Energy &amp; CRM Platform</span>
            </div>

            <h1 id="hero-heading" className="hero-title">
              Solar Management System <br />
              <span className="text-gradient">Engineered by Gaurav Chavda</span>
            </h1>

            <p className="hero-subtitle">
              The all-in-one <strong>Solar Plant Monitoring</strong>, <strong>Solar CRM</strong>, and <strong>Installation Management Software</strong> built by <strong>Gaurav Chavda</strong> (also known as <em>Chavda Gaurav</em>) in <strong>Rajkot, Gujarat, India</strong>. Streamline your entire solar EPC workflow from lead to lifetime maintenance.
            </p>

            <div className="hero-cta-group">
              <Link to="/login" className="btn-primary-hero">
                <span>Launch Solar Dashboard</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <a href="#features" className="btn-secondary-hero">
                <span>Explore Features</span>
              </a>
              <Link to="/about" className="btn-ghost-hero">
                <span>About the Creator</span>
              </Link>
            </div>

            {/* Key Metrics Strip */}
            <div className="hero-stats-strip">
              <div className="stat-card">
                <span className="stat-number">50+ MW</span>
                <span className="stat-label">Solar Plants Monitored</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">10,000+</span>
                <span className="stat-label">Rooftop Panels Tracked</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">99.8%</span>
                <span className="stat-label">Plant Uptime Achieved</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">40%</span>
                <span className="stat-label">Faster EPC Turnaround</span>
              </div>
            </div>
          </div>
        </section>

        {/* ========== FEATURES SECTION ========== */}
        <section id="features" className="section-block features-section" aria-labelledby="features-heading">
          <div className="page-container">
            <div className="section-header text-center">
              <span className="section-tag">Powerful Capabilities</span>
              <h2 id="features-heading" className="section-title">
                Complete Solar EPC &amp; CRM Lifecycle Management
              </h2>
              <p className="section-desc">
                Everything required to scale commercial, industrial, and rooftop solar businesses across Gujarat and India.
              </p>
            </div>

            <div className="features-grid">
              {features.map((feat, idx) => (
                <article className="feature-card" key={idx}>
                  <div className="feature-icon">{feat.icon}</div>
                  <h3 className="feature-title">{feat.title}</h3>
                  <p className="feature-desc">{feat.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ========== HOW IT WORKS SECTION ========== */}
        <section id="how-it-works" className="section-block how-it-works-section" aria-labelledby="how-heading">
          <div className="page-container">
            <div className="section-header text-center">
              <span className="section-tag">Seamless Workflow</span>
              <h2 id="how-heading" className="section-title">
                How Solar Management System Works
              </h2>
              <p className="section-desc">
                From initial customer inquiry to grid commissioning and lifetime AMC monitoring.
              </p>
            </div>

            <div className="workflow-grid">
              {steps.map((st, index) => (
                <div className="workflow-step-card" key={index}>
                  <div className="step-num">{st.num}</div>
                  <h3 className="step-title">{st.title}</h3>
                  <p className="step-desc">{st.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== CALCULATOR SECTION ========== */}
        <section id="calculator" className="section-block calc-section" aria-labelledby="calc-heading">
          <div className="page-container">
            <div className="section-header text-center">
              <span className="section-tag">ROI &amp; Sizing Tool</span>
              <h2 id="calc-heading" className="section-title">
                Estimate Your Solar Capacity &amp; Financial Savings
              </h2>
            </div>
            <SolarCalculator />
          </div>
        </section>

        {/* ========== BENEFITS SECTION ========== */}
        <section id="benefits" className="section-block benefits-section" aria-labelledby="benefits-heading">
          <div className="page-container">
            <div className="section-header text-center">
              <span className="section-tag">Tangible Value</span>
              <h2 id="benefits-heading" className="section-title">
                Why Solar Companies Choose This System
              </h2>
            </div>

            <div className="benefits-grid">
              <div className="benefit-item">
                <div className="benefit-check">✓</div>
                <div>
                  <h3 className="benefit-heading">Accelerate PM Surya Ghar Subsidies</h3>
                  <p className="benefit-text">
                    Automate DISCOM paperwork, document checklists, and submission tracking to ensure fast customer subsidy approval without manual errors.
                  </p>
                </div>
              </div>
              <div className="benefit-item">
                <div className="benefit-check">✓</div>
                <div>
                  <h3 className="benefit-heading">Maximize Energy Yield &amp; PR</h3>
                  <p className="benefit-text">
                    Continuous monitoring alerts plant engineers to inverter clipping, string underperformance, and soiling issues before energy loss compounds.
                  </p>
                </div>
              </div>
              <div className="benefit-item">
                <div className="benefit-check">✓</div>
                <div>
                  <h3 className="benefit-heading">Streamline Field Technicians</h3>
                  <p className="benefit-text">
                    GPS location verification, daily material logs, and digital commissioning checklists ensure high accountability on rooftop job sites.
                  </p>
                </div>
              </div>
              <div className="benefit-item">
                <div className="benefit-check">✓</div>
                <div>
                  <h3 className="benefit-heading">Built for Gujarat &amp; Indian Solar EPCs</h3>
                  <p className="benefit-text">
                    Developed by Gaurav Chavda with native support for Indian electrical codes, GST taxation, multi-tier roles, and local DISCOM regulations.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== ABOUT CREATOR SPOTLIGHT ========== */}
        <section className="section-block creator-spotlight" aria-labelledby="creator-heading">
          <div className="page-container">
            <div className="creator-card">
              <div className="creator-info">
                <span className="section-tag">Architect &amp; Developer</span>
                <h2 id="creator-heading" className="creator-name">Gaurav Chavda (Chavda Gaurav)</h2>
                <p className="creator-role">Lead Full-Stack Engineer • Rajkot, Gujarat, India</p>
                <p className="creator-bio">
                  <strong>Gaurav Chavda</strong> is a software engineer with deep technical expertise in modern web architectures, enterprise SaaS systems, and solar energy automation. Recognizing the operational bottlenecks faced by solar installers across Gujarat, he engineered the <strong>Solar Management System</strong> to bridge the gap between engineering precision and business execution.
                </p>
                <div className="creator-links">
                  <Link to="/about" className="btn-learn-more">
                    Read Full Profile &amp; Architecture →
                  </Link>
                  <a href={SITE_CONFIG.socialLinks.github} target="_blank" rel="noopener noreferrer" className="creator-social-link">
                    GitHub Profile
                  </a>
                  <a href={SITE_CONFIG.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="creator-social-link">
                    LinkedIn
                  </a>
                </div>
              </div>
              <div className="creator-visual">
                <img
                  src={solarLogo}
                  alt="Solar Management System - Gaurav Chavda"
                  width="220"
                  height="220"
                  className="creator-badge-logo"
                  loading="lazy"
                />
                <div className="creator-tag-badge">
                  <span>📍 Rajkot, Gujarat, India</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== FAQ SECTION ========== */}
        <section id="faq" className="section-block faq-section" aria-labelledby="faq-heading">
          <div className="page-container faq-container">
            <div className="section-header text-center">
              <span className="section-tag">Got Questions?</span>
              <h2 id="faq-heading" className="section-title">
                Frequently Asked Questions
              </h2>
              <p className="section-desc">
                Clear answers regarding the Solar Management System, deployment, and capabilities.
              </p>
            </div>

            <div className="faq-accordion">
              {FAQ_DATA.map((faq, index) => {
                const isOpen = activeFaq === index;
                return (
                  <details
                    className="faq-item"
                    key={index}
                    open={isOpen}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFaq(index);
                    }}
                  >
                    <summary className="faq-question">
                      <span>{faq.question}</span>
                      <span className={`faq-chevron ${isOpen ? "open" : ""}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-answer">
                      <p>{faq.answer}</p>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </section>

        {/* ========== CONTACT SECTION ========== */}
        <section id="contact" className="section-block contact-section" aria-labelledby="contact-heading">
          <div className="page-container">
            <div className="contact-grid">
              <div className="contact-info">
                <span className="section-tag">Get in Touch</span>
                <h2 id="contact-heading" className="section-title">
                  Connect with Gaurav Chavda
                </h2>
                <p className="contact-desc">
                  Interested in custom solar software deployments, API integrations, or enterprise solar dashboards? Reach out directly.
                </p>

                <div className="contact-details-list">
                  <div className="detail-row">
                    <span className="detail-icon">📍</span>
                    <div>
                      <strong>Location:</strong>
                      <p>Rajkot, Gujarat, India - 360001</p>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span className="detail-icon">✉️</span>
                    <div>
                      <strong>Email:</strong>
                      <p><a href={`mailto:${SITE_CONFIG.contactEmail}`}>{SITE_CONFIG.contactEmail}</a></p>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span className="detail-icon">📞</span>
                    <div>
                      <strong>Contact:</strong>
                      <p>{SITE_CONFIG.phone}</p>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span className="detail-icon">🌐</span>
                    <div>
                      <strong>Developer:</strong>
                      <p>Gaurav Chavda (Chavda Gaurav)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="contact-form-card">
                {contactSubmitted ? (
                  <div className="form-success-message">
                    <div className="success-check-icon">✓</div>
                    <h3>Thank You!</h3>
                    <p>Your message has been received. Gaurav Chavda will get back to you shortly.</p>
                    <button
                      type="button"
                      className="btn-primary-hero"
                      onClick={() => setContactSubmitted(false)}
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="landing-contact-form">
                    <h3 className="form-title">Send a Direct Inquiry</h3>
                    <div className="form-row">
                      <div className="input-group">
                        <label htmlFor="c-name">Full Name *</label>
                        <input
                          id="c-name"
                          type="text"
                          required
                          placeholder="e.g. Rajesh Patel"
                          value={contactForm.name}
                          onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor="c-email">Email Address *</label>
                        <input
                          id="c-email"
                          type="email"
                          required
                          placeholder="name@company.com"
                          value={contactForm.email}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="input-group">
                        <label htmlFor="c-phone">Phone Number</label>
                        <input
                          id="c-phone"
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={contactForm.phone}
                          onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor="c-company">Company / Solar EPC</label>
                        <input
                          id="c-company"
                          type="text"
                          placeholder="e.g. Gujarat Solar Power Ltd"
                          value={contactForm.company}
                          onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="input-group">
                      <label htmlFor="c-msg">Project Requirements / Message *</label>
                      <textarea
                        id="c-msg"
                        required
                        rows="4"
                        placeholder="Tell us about your solar plant capacity, number of technicians, or custom CRM needs..."
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      ></textarea>
                    </div>

                    <button type="submit" className="btn-submit-inquiry">
                      Submit Inquiry to Gaurav Chavda
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default LandingPage;
