import React, { useEffect } from "react";
import { SITE_CONFIG, PAGES_SEO, getStructuredData } from "../../config/seo.config";

export const SEOHead = ({ pageKey = "home", customTitle, customDescription, customCanonical }) => {
  const pageMeta = PAGES_SEO[pageKey] || PAGES_SEO.home;
  const title = customTitle || pageMeta.title;
  const description = customDescription || pageMeta.description;
  const canonicalPath = customCanonical || pageMeta.canonical;
  const canonicalUrl = `${SITE_CONFIG.baseUrl}${canonicalPath === "/" ? "" : canonicalPath}`;
  const ogImageUrl = `${SITE_CONFIG.baseUrl}${SITE_CONFIG.defaultOgImage}`;
  const keywords = [...(pageMeta.keywords || []), ...SITE_CONFIG.keywords].slice(0, 20).join(", ");

  useEffect(() => {
    // 1. Title
    document.title = title;

    // Helper to set or create meta tag
    const setMeta = (attr, key, content) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Helper to set or create link tag
    const setLink = (rel, href, extraAttrs = {}) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
      Object.keys(extraAttrs).forEach(k => el.setAttribute(k, extraAttrs[k]));
    };

    // Standard Metas
    setMeta("name", "description", description);
    setMeta("name", "keywords", keywords);
    setMeta("name", "author", `${SITE_CONFIG.author} (${SITE_CONFIG.alternateAuthorName})`);
    setMeta("name", "robots", pageKey === "notFound" ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
    setMeta("name", "geo.region", "IN-GJ");
    setMeta("name", "geo.placename", SITE_CONFIG.location?.city || "Rajkot");
    setMeta("name", "geo.position", `${SITE_CONFIG.location?.geo?.latitude || "22.3039"};${SITE_CONFIG.location?.geo?.longitude || "70.8022"}`);
    setMeta("name", "ICBM", `${SITE_CONFIG.location?.geo?.latitude || "22.3039"}, ${SITE_CONFIG.location?.geo?.longitude || "70.8022"}`);

    // Canonical & Hreflang
    setLink("canonical", canonicalUrl);
    setLink("alternate", canonicalUrl, { hreflang: "en-IN" });
    setLink("alternate", canonicalUrl, { hreflang: "x-default" });

    // Open Graph Tags
    setMeta("property", "og:type", pageKey === "home" ? "website" : "article");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:site_name", SITE_CONFIG.name);
    setMeta("property", "og:locale", "en_IN");
    setMeta("property", "og:image", ogImageUrl);
    setMeta("property", "og:image:width", "1200");
    setMeta("property", "og:image:height", "630");
    setMeta("property", "og:image:alt", `${SITE_CONFIG.name} by ${SITE_CONFIG.author}`);

    // Twitter Card
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", ogImageUrl);
    setMeta("name", "twitter:creator", "@gauravchavda_dev");

    // Structured Data (JSON-LD)
    const jsonLdData = getStructuredData(pageKey);
    let scriptEl = document.getElementById("structured-data-jsonld");
    if (!scriptEl) {
      scriptEl = document.createElement("script");
      scriptEl.id = "structured-data-jsonld";
      scriptEl.type = "application/ld+json";
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": jsonLdData
    });

  }, [title, description, canonicalUrl, keywords, ogImageUrl, pageKey]);

  return null;
};

export default SEOHead;
