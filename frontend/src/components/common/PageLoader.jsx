import React from "react";
import "./PageLoader.css";

const PageLoader = ({ message = "Loading data, please wait...", fullScreen = false, minHeight }) => {
  return (
    <div
      className={`page-loader-container ${fullScreen ? "full-screen" : ""}`}
      style={minHeight ? { minHeight } : undefined}
    >
      <div className="page-loader-spinner-wrapper">
        <div className="page-loader-spinner" />
      </div>
      <span className="page-loader-text">{message}</span>
    </div>
  );
};

export default PageLoader;
