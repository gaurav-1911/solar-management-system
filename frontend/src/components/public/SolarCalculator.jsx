import React, { useState } from "react";
import "./SolarCalculator.css";

export const SolarCalculator = () => {
  const [bill, setBill] = useState(4500); // INR per month
  const [rate, setRate] = useState(8); // INR per unit (kWh)
  const [tariffType, setTariffType] = useState("residential");

  // Calculations based on Gujarat / Indian solar metrics
  const unitsPerMonth = bill / rate;
  const unitsPerDay = unitsPerMonth / 30;
  // In India/Gujarat, 1 kW solar plant produces ~4 units/day (avg 1400-1500 units/year)
  const requiredKw = Math.max(1, Math.round((unitsPerDay / 4) * 10) / 10);
  const annualUnitsGenerated = requiredKw * 1460;
  const annualSavings = Math.round(annualUnitsGenerated * rate);
  const estSystemCost = requiredKw <= 3 ? requiredKw * 65000 : requiredKw * 58000;
  // PM Surya Ghar Subsidy (up to 78,000 for 3kW)
  let subsidy = 0;
  if (tariffType === "residential") {
    if (requiredKw <= 1) subsidy = 30000;
    else if (requiredKw <= 2) subsidy = 60000;
    else subsidy = 78000;
  }
  const netInvestment = Math.max(0, estSystemCost - subsidy);
  const paybackYears = Math.round((netInvestment / annualSavings) * 10) / 10;
  const carbonOffsetTons = Math.round(annualUnitsGenerated * 0.00082 * 10) / 10; // ~0.82 kg CO2 per kWh

  return (
    <div className="solar-calc-card">
      <div className="calc-header">
        <span className="calc-badge">⚡ Interactive Estimator</span>
        <h3 className="calc-title">Solar Savings &amp; Capacity Calculator</h3>
        <p className="calc-subtitle">
          Calculate recommended system capacity, PM Surya Ghar subsidy, and estimated annual savings.
        </p>
      </div>

      <div className="calc-body-grid">
        <div className="calc-controls">
          <div className="form-group">
            <label htmlFor="bill-range">
              <span>Monthly Electricity Bill:</span>
              <strong className="val-highlight">₹{bill.toLocaleString("en-IN")} / month</strong>
            </label>
            <input
              id="bill-range"
              type="range"
              min="1000"
              max="50000"
              step="500"
              value={bill}
              onChange={(e) => setBill(Number(e.target.value))}
              className="calc-slider"
            />
            <div className="slider-ticks">
              <span>₹1k</span>
              <span>₹15k</span>
              <span>₹30k</span>
              <span>₹50k</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="rate-range">
              <span>Electricity Tariff Rate:</span>
              <strong className="val-highlight">₹{rate} / kWh</strong>
            </label>
            <input
              id="rate-range"
              type="range"
              min="4"
              max="14"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="calc-slider"
            />
          </div>

          <div className="form-group">
            <label>Customer Category:</label>
            <div className="category-toggle">
              <button
                type="button"
                className={`toggle-btn ${tariffType === "residential" ? "active" : ""}`}
                onClick={() => setTariffType("residential")}
              >
                Residential (PM Surya Ghar)
              </button>
              <button
                type="button"
                className={`toggle-btn ${tariffType === "commercial" ? "active" : ""}`}
                onClick={() => setTariffType("commercial")}
              >
                Commercial / Industrial
              </button>
            </div>
          </div>
        </div>

        <div className="calc-results">
          <div className="result-metric primary-result">
            <span className="metric-label">Recommended Capacity</span>
            <div className="metric-value">{requiredKw} <span className="unit">kW System</span></div>
            <span className="metric-note">Estimated rooftop area: ~{requiredKw * 80} sq. ft.</span>
          </div>

          <div className="result-grid-mini">
            <div className="mini-metric">
              <span className="mini-label">Annual Savings</span>
              <span className="mini-val text-green">₹{annualSavings.toLocaleString("en-IN")}</span>
            </div>
            {tariffType === "residential" && (
              <div className="mini-metric">
                <span className="mini-label">Govt. Subsidy</span>
                <span className="mini-val text-amber">₹{subsidy.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="mini-metric">
              <span className="mini-label">Net Investment</span>
              <span className="mini-val">₹{netInvestment.toLocaleString("en-IN")}</span>
            </div>
            <div className="mini-metric">
              <span className="mini-label">Payback Period</span>
              <span className="mini-val text-blue">~{paybackYears} Years</span>
            </div>
            <div className="mini-metric">
              <span className="mini-label">CO₂ Offset / Year</span>
              <span className="mini-val text-emerald">{carbonOffsetTons} Tons</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolarCalculator;
