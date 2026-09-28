/**
 * Centralized Production SEO Configuration
 * Solar Management System by Gaurav Chavda (Chavda Gaurav)
 * Location: Rajkot, Gujarat, India
 */

export const SITE_CONFIG = {
  name: "Solar Management System",
  shortName: "Solar PMS",
  tagline: "Monitor, Manage & Optimise Solar Energy",
  author: "Gaurav Chavda",
  alternateAuthorName: "Chavda Gaurav",
  authorJobTitle: "Full-Stack Engineer & Solar Software Architect",
  authorBio: "Gaurav Chavda (also known as Chavda Gaurav) is a full-stack engineer and renewable energy software developer based in Rajkot, Gujarat, India, specializing in enterprise Solar CRM and IoT plant monitoring platforms.",
  location: {
    city: "Rajkot",
    state: "Gujarat",
    country: "India",
    postalCode: "360001",
    region: "IN-GJ",
    geo: {
      latitude: "22.3039",
      longitude: "70.8022"
    }
  },
  baseUrl: "https://gaurav-1911.github.io/solar-management-system",
  contactEmail: "gauravchavda.vhits@gmail.com",
  phone: "+91 98765 00001",
  socialLinks: {
    github: "https://github.com/gaurav-1911",
    linkedin: "https://www.linkedin.com/in/gaurav-chavda-solar",
    twitter: "https://twitter.com/gauravchavda_dev"
  },
  indexNowKey: "e4d7b2a9f1c84365908271e54a3b6c8d",
  defaultOgImage: "/og-image-1200x630.png",
  defaultOgImageWebp: "/og-image-1200x630.webp",
  whatsappShareImage: "/whatsapp-share-1200x1200.png",
  logoUrl: "/logo.png",
  themeColor: "#f59e0b",
  keywords: [
    "Gaurav Chavda",
    "Chavda Gaurav",
    "Gaurav Chavda Rajkot",
    "Gaurav Chavda developer",
    "Gaurav Chavda solar",
    "solar management system",
    "solar monitoring software",
    "solar plant management",
    "solar energy management",
    "solar panel monitoring system",
    "solar installation management",
    "solar CRM",
    "solar project management software",
    "rooftop solar management",
    "solar billing and maintenance system",
    "solar dashboard India",
    "solar management system Rajkot",
    "solar management system Gujarat",
    "solar management system India",
    "PM Surya Ghar Muft Bijli Yojana CRM"
  ]
};

export const PAGES_SEO = {
  home: {
    title: "Solar Management System | Gaurav Chavda - Solar CRM", // 52 chars (perfect 50-60 range)
    description: "Enterprise Solar Management System & CRM by Gaurav Chavda in Rajkot, Gujarat. Real-time solar plant monitoring, quotations, technician tracking & AMC.", // 151 chars
    canonical: "/",
    keywords: [
      "solar management system",
      "Gaurav Chavda",
      "Chavda Gaurav",
      "solar monitoring software Rajkot",
      "solar CRM Gujarat",
      "solar plant management India"
    ],
    breadcrumb: [
      { name: "Home", url: "/" }
    ]
  },
  about: {
    title: "About Gaurav Chavda | Creator of Solar Management System", // 56 chars
    description: "Learn about Gaurav Chavda (Chavda Gaurav), full-stack engineer and solar software architect behind the Solar Management System in Rajkot, Gujarat.", // 149 chars
    canonical: "/about",
    keywords: [
      "Gaurav Chavda",
      "Chavda Gaurav",
      "Gaurav Chavda Rajkot",
      "Gaurav Chavda developer",
      "about Gaurav Chavda solar"
    ],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "About Gaurav Chavda", url: "/about" }
    ]
  },
  features: {
    title: "Features | Solar Management System by Gaurav Chavda", // 52 chars
    description: "Explore Solar Management System features: real-time telemetry, automated quotations, 3D site surveys, technician dispatch, inventory, and subsidy tracking.", // 157 chars
    canonical: "/features",
    keywords: [
      "solar management system features",
      "solar CRM features",
      "solar site survey software",
      "solar technician dispatch"
    ],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "Features", url: "/features" }
    ]
  },
  benefits: {
    title: "Benefits | Solar Management System by Gaurav Chavda", // 52 chars
    description: "Maximize solar plant ROI, eliminate EPC paperwork, and automate maintenance workflows with Solar Management System engineered by Gaurav Chavda.", // 146 chars
    canonical: "/benefits",
    keywords: [
      "solar CRM benefits",
      "solar plant optimization ROI",
      "solar maintenance software benefits"
    ],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "Benefits", url: "/benefits" }
    ]
  },
  faq: {
    title: "FAQ | Solar Management System by Gaurav Chavda", // 47 chars
    description: "Get answers to frequently asked questions about the Solar Management System, PM Surya Ghar subsidy tracking, and solar EPC automation by Gaurav Chavda.", // 152 chars
    canonical: "/faq",
    keywords: [
      "solar management system FAQ",
      "solar monitoring software questions",
      "Gaurav Chavda solar software help"
    ],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "FAQ", url: "/faq" }
    ]
  },
  contact: {
    title: "Contact Gaurav Chavda | Solar Management System", // 48 chars
    description: "Get in touch with Gaurav Chavda in Rajkot, Gujarat for Solar Management System deployment, custom enterprise solar software, and technical support.", // 147 chars
    canonical: "/contact",
    keywords: [
      "contact Gaurav Chavda",
      "Gaurav Chavda Rajkot",
      "solar management system contact"
    ],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "Contact", url: "/contact" }
    ]
  },
  login: {
    title: "Sign In | Solar Management System by Gaurav Chavda", // 51 chars
    description: "Secure login portal for Solar Management System administrators, project managers, accountants, and field technicians.", // 118 chars
    canonical: "/login",
    keywords: ["solar management system login", "solar CRM sign in", "Gaurav Chavda admin portal"],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "Sign In", url: "/login" }
    ]
  },
  notFound: {
    title: "404 - Page Not Found | Solar Management System", // 47 chars
    description: "The page you requested was not found on Solar Management System by Gaurav Chavda. Return to our homepage or sign in to your dashboard.", // 134 chars
    canonical: "/404",
    keywords: ["solar management system 404", "page not found"],
    breadcrumb: [
      { name: "Home", url: "/" },
      { name: "404 Not Found", url: "/404" }
    ]
  }
};

export const FAQ_DATA = [
  {
    question: "What is the Solar Management System created by Gaurav Chavda?",
    answer: "The Solar Management System is an enterprise CRM, IoT monitoring, and EPC workflow platform designed by Gaurav Chavda in Rajkot, Gujarat, India. It streamlines solar leads, site surveys, quotation calculations, technician field dispatch, inventory tracking, AMC maintenance, and PM Surya Ghar subsidy documentation."
  },
  {
    question: "Who is Gaurav Chavda (Chavda Gaurav)?",
    answer: "Gaurav Chavda (also searched as Chavda Gaurav) is a full-stack engineer and renewable energy software developer based in Rajkot, Gujarat, India. He architected the Solar Management System to streamline operations for commercial and rooftop solar installations."
  },
  {
    question: "Can this solar software monitor energy output in real-time?",
    answer: "Yes. The Solar Management System features real-time telemetry dashboards that display power generation (kW), energy yield (kWh), string inverter performance, performance ratio (PR), and automated alert notifications for inverter faults or grid downtime."
  },
  {
    question: "Does the system support Indian government solar subsidy workflows (PM Surya Ghar)?",
    answer: "Yes. The platform includes dedicated tracking for PM Surya Ghar Muft Bijli Yojana workflows, DISCOM net-metering application logging, document verification, inspection scheduling, and subsidy disbursement status updates."
  },
  {
    question: "How does the system handle field technicians and site surveys?",
    answer: "Field technicians can record GPS-tagged site surveys, capture rooftop azimuth and shadow profiles, log daily progress with photos, and manage scheduled service visits."
  },
  {
    question: "Is this Solar Management System suitable for solar EPCs in Rajkot and Gujarat?",
    answer: "Yes. Tailored specifically for Gujarat's solar hub and nationwide EPC companies, it supports local DISCOM workflows (PGVCL, DGVCL, MGVCL, UGVCL), GST invoicing, multi-warehouse inventory, and role-based access control."
  }
];

export const getStructuredData = (pageKey = "home") => {
  const page = PAGES_SEO[pageKey] || PAGES_SEO.home;
  
  // 1. Person Schema (Accurate author profile)
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_CONFIG.baseUrl}/#person`,
    "name": SITE_CONFIG.author,
    "alternateName": SITE_CONFIG.alternateAuthorName,
    "jobTitle": SITE_CONFIG.authorJobTitle,
    "description": SITE_CONFIG.authorBio,
    "url": `${SITE_CONFIG.baseUrl}/about`,
    "image": `${SITE_CONFIG.baseUrl}/logo.png`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": SITE_CONFIG.location.city,
      "addressRegion": SITE_CONFIG.location.state,
      "addressCountry": "India",
      "postalCode": SITE_CONFIG.location.postalCode
    },
    "sameAs": [
      SITE_CONFIG.socialLinks.github,
      SITE_CONFIG.socialLinks.linkedin,
      SITE_CONFIG.socialLinks.twitter
    ]
  };

  // 2. WebSite Schema
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_CONFIG.baseUrl}/#website`,
    "url": SITE_CONFIG.baseUrl,
    "name": SITE_CONFIG.name,
    "alternateName": [SITE_CONFIG.shortName, "Solar Management System India", "Solar PMS Rajkot"],
    "description": SITE_CONFIG.tagline,
    "publisher": {
      "@id": `${SITE_CONFIG.baseUrl}/#person`
    }
  };

  // 3. SoftwareApplication Schema
  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_CONFIG.baseUrl}/#software`,
    "name": SITE_CONFIG.name,
    "alternateName": "Solar PMS by Gaurav Chavda",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": page.description,
    "url": SITE_CONFIG.baseUrl,
    "author": {
      "@id": `${SITE_CONFIG.baseUrl}/#person`
    },
    "featureList": [
      "Real-time IoT Solar Generation Monitoring",
      "Automated Solar Quotation and Proposal Generation",
      "Rooftop Solar Site Survey & Azimuth Analysis",
      "Field Technician Dispatch & GPS Tracking",
      "Preventive AMC Maintenance Scheduling",
      "PM Surya Ghar Subsidy Workflow Tracking",
      "GST Invoicing, Credit Notes & Billing",
      "Role-Based Access Control (RBAC) & Audit Logs"
    ]
  };

  // 4. Breadcrumbs Schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": (page.breadcrumb || []).map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": `${SITE_CONFIG.baseUrl}${item.url}`
    }))
  };

  // 5. FAQ Schema (Included on home/faq pages)
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": FAQ_DATA.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  };

  return [
    personSchema,
    websiteSchema,
    softwareAppSchema,
    breadcrumbSchema,
    faqSchema
  ];
};
