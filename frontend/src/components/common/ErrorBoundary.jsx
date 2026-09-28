import React, { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error loading section:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          className="dashboard-card"
          style={{
            padding: "40px 24px",
            textAlign: "center",
            maxWidth: "540px",
            margin: "40px auto",
            borderRadius: "14px",
            background: "#ffffff",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
            border: "1px solid #fee2e2"
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: "#fef2f2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px"
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 style={{ fontSize: "17px", fontWeight: "700", color: "#1e293b", margin: "0 0 8px" }}>
            Failed to load section
          </h3>
          <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 20px", lineHeight: "1.5" }}>
            {this.state.error?.message || "A network or code error occurred while loading this module. Please try again."}
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: "9px 18px",
                borderRadius: "8px",
                background: "#2c5364",
                color: "#ffffff",
                border: "none",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              Retry Loading
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "9px 18px",
                borderRadius: "8px",
                background: "#f1f5f9",
                color: "#475569",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
