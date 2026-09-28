import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../../components/common/Toast";
import { PageLoader } from "../../components/common";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import "./SolarMonitoring.css";

const PRODUCTION_TABS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

const dailyData = [
  { time: "6 AM", generation: 1.2, consumption: 0.8 },
  { time: "7 AM", generation: 2.8, consumption: 1.0 },
  { time: "8 AM", generation: 4.5, consumption: 1.2 },
  { time: "9 AM", generation: 6.2, consumption: 1.4 },
  { time: "10 AM", generation: 7.8, consumption: 1.6 },
  { time: "11 AM", generation: 8.5, consumption: 1.8 },
  { time: "12 PM", generation: 8.9, consumption: 2.0 },
  { time: "1 PM", generation: 8.7, consumption: 1.9 },
  { time: "2 PM", generation: 7.9, consumption: 1.7 },
  { time: "3 PM", generation: 6.4, consumption: 1.5 },
  { time: "4 PM", generation: 4.8, consumption: 1.3 },
  { time: "5 PM", generation: 3.1, consumption: 1.1 },
  { time: "6 PM", generation: 1.5, consumption: 0.9 },
];

const weeklyData = [
  { day: "Mon", generation: 42.5, consumption: 18.2 },
  { day: "Tue", generation: 38.1, consumption: 19.5 },
  { day: "Wed", generation: 45.8, consumption: 17.8 },
  { day: "Thu", generation: 41.2, consumption: 20.1 },
  { day: "Fri", generation: 44.6, consumption: 18.9 },
  { day: "Sat", generation: 36.9, consumption: 16.4 },
  { day: "Sun", generation: 33.2, consumption: 15.1 },
];

const monthlyData = [
  { month: "Jan", generation: 1120, consumption: 580 },
  { month: "Feb", generation: 1280, consumption: 540 },
  { month: "Mar", generation: 1450, consumption: 620 },
  { month: "Apr", generation: 1580, consumption: 650 },
  { month: "May", generation: 1620, consumption: 710 },
  { month: "Jun", generation: 1490, consumption: 680 },
  { month: "Jul", generation: 1560, consumption: 640 },
  { month: "Aug", generation: 1480, consumption: 600 },
  { month: "Sep", generation: 1350, consumption: 570 },
  { month: "Oct", generation: 1220, consumption: 530 },
  { month: "Nov", generation: 1080, consumption: 490 },
  { month: "Dec", generation: 980, consumption: 460 },
];

const yearlyData = [
  { year: "2021", generation: 14200, consumption: 7800 },
  { year: "2022", generation: 15800, consumption: 7200 },
  { year: "2023", generation: 17100, consumption: 6900 },
  { year: "2024", generation: 18500, consumption: 6500 },
  { year: "2025", generation: 19200, consumption: 6200 },
  { year: "2026", generation: 16580, consumption: 5370 },
];

const efficiencyData = [
  { time: "6 AM", efficiency: 72 },
  { time: "8 AM", efficiency: 81 },
  { time: "10 AM", efficiency: 88 },
  { time: "12 PM", efficiency: 92 },
  { time: "2 PM", efficiency: 89 },
  { time: "4 PM", efficiency: 83 },
  { time: "6 PM", efficiency: 74 },
];

const co2Data = [
  { month: "Jan", saved: 896 },
  { month: "Feb", saved: 1024 },
  { month: "Mar", saved: 1160 },
  { month: "Apr", saved: 1264 },
  { month: "May", saved: 1296 },
  { month: "Jun", saved: 1192 },
  { month: "Jul", saved: 1248 },
  { month: "Aug", saved: 1184 },
  { month: "Sep", saved: 1080 },
  { month: "Oct", saved: 976 },
  { month: "Nov", saved: 864 },
  { month: "Dec", saved: 784 },
];

const generateRealtimeMetrics = () => ({
  currentOutput: +(3.5 + Math.random() * 2.5).toFixed(2),
  voltage: +(220 + Math.random() * 15).toFixed(1),
  current: +(12 + Math.random() * 6).toFixed(1),
  frequency: +(49.8 + Math.random() * 0.4).toFixed(2),
  batteryHealth: +(82 + Math.random() * 15).toFixed(1),
  gridExport: +(1.8 + Math.random() * 1.5).toFixed(2),
  gridImport: +(0.3 + Math.random() * 0.5).toFixed(2),
  temperature: +(32 + Math.random() * 12).toFixed(1),
  efficiency: +(85 + Math.random() * 10).toFixed(1),
});

const SolarMonitoring = () => {
  const [activeTab, setActiveTab] = useState("daily");
  const [metrics, setMetrics] = useState(generateRealtimeMetrics);
  const [loading, setLoading] = useState(true);
  const { info } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const updateMetrics = useCallback(() => {
    setMetrics(generateRealtimeMetrics());
  }, []);

  useEffect(() => {
    const interval = setInterval(updateMetrics, 3000);
    return () => clearInterval(interval);
  }, [updateMetrics]);

  useEffect(() => {
    info("Solar monitoring dashboard loaded. Live data refreshing every 3s.");
  }, [info]);

  const getChartData = () => {
    switch (activeTab) {
      case "daily": return { data: dailyData, xKey: "time", label: "Today's Production (kWh)" };
      case "weekly": return { data: weeklyData, xKey: "day", label: "This Week's Production (kWh)" };
      case "monthly": return { data: monthlyData, xKey: "month", label: "Monthly Production (kWh)" };
      case "yearly": return { data: yearlyData, xKey: "year", label: "Yearly Production (kWh)" };
      default: return { data: dailyData, xKey: "time", label: "Today's Production (kWh)" };
    }
  };

  const chartInfo = getChartData();

  const totalGeneration = chartInfo.data.reduce((sum, d) => sum + d.generation, 0);
  const totalConsumption = chartInfo.data.reduce((sum, d) => sum + d.consumption, 0);
  const netExport = totalGeneration - totalConsumption;

  const totalCO2Saved = co2Data.reduce((sum, d) => sum + d.saved, 0);
  const treesEquivalent = Math.round(totalCO2Saved / 21);
  const carsOffRoad = +(totalCO2Saved / 4600).toFixed(1);

  return (
    <div className="monitoring-page">
      {loading ? (
        <PageLoader minHeight="350px" />
      ) : (
        <>
      {/* Live Status Banner */}
      <div className="live-banner">
        <div className="live-indicator">
          <span className="live-dot"></span>
          <span className="live-text">Live Monitoring</span>
        </div>
        <span className="live-update">Auto-refreshing every 3s</span>
      </div>

      {/* Monitoring Metrics Cards */}
      <div className="metrics-grid">
        <MetricCard
          icon="output"
          label="Current Output"
          value={`${metrics.currentOutput} kW`}
          status="good"
        />
        <MetricCard
          icon="voltage"
          label="Voltage"
          value={`${metrics.voltage} V`}
          status="good"
        />
        <MetricCard
          icon="current"
          label="Current"
          value={`${metrics.current} A`}
          status="good"
        />
        <MetricCard
          icon="frequency"
          label="Frequency"
          value={`${metrics.frequency} Hz`}
          status={metrics.frequency >= 49.9 && metrics.frequency <= 50.1 ? "good" : "warning"}
        />
        <MetricCard
          icon="battery"
          label="Battery Health"
          value={`${metrics.batteryHealth}%`}
          status={metrics.batteryHealth > 80 ? "good" : metrics.batteryHealth > 50 ? "warning" : "critical"}
        />
        <MetricCard
          icon="export"
          label="Grid Export"
          value={`${metrics.gridExport} kWh`}
          status="good"
        />
        <MetricCard
          icon="import"
          label="Grid Import"
          value={`${metrics.gridImport} kWh`}
          status="good"
        />
        <MetricCard
          icon="temp"
          label="Temperature"
          value={`${metrics.temperature}°C`}
          status={metrics.temperature < 45 ? "good" : "warning"}
        />
        <MetricCard
          icon="efficiency"
          label="Efficiency"
          value={`${metrics.efficiency}%`}
          status={metrics.efficiency > 85 ? "good" : "warning"}
        />
      </div>

      {/* Production Chart with Tabs */}
      <div className="monitoring-card">
        <div className="card-top">
          <h3>Power Generation</h3>
          <div className="production-tabs">
            {PRODUCTION_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-stats-row">
          <div className="chart-stat">
            <span className="chart-stat-label">Total Generated</span>
            <span className="chart-stat-value green">{totalGeneration.toFixed(1)} kWh</span>
          </div>
          <div className="chart-stat">
            <span className="chart-stat-label">Total Consumed</span>
            <span className="chart-stat-value blue">{totalConsumption.toFixed(1)} kWh</span>
          </div>
          <div className="chart-stat">
            <span className="chart-stat-label">Net Export</span>
            <span className="chart-stat-value">{netExport.toFixed(1)} kWh</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartInfo.data}>
            <defs>
              <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="conGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={chartInfo.xKey} tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <Tooltip
              contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="generation"
              name="Generation"
              stroke="#16a34a"
              fill="url(#genGrad)"
              strokeWidth={2.5}
            />
            <Area
              type="monotone"
              dataKey="consumption"
              name="Consumption"
              stroke="#2563eb"
              fill="url(#conGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Efficiency + CO2 Row */}
      <div className="monitoring-row">
        {/* Efficiency Analysis */}
        <div className="monitoring-card">
          <div className="card-top">
            <h3>Efficiency Analysis</h3>
            <span className="card-badge">Today</span>
          </div>
          <div className="efficiency-summary">
            <div className="eff-circle">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#f0f0f0" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke="#16a34a" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 42 * (metrics.efficiency / 100)} ${2 * Math.PI * 42}`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="eff-circle-text">
                <span className="eff-value">{metrics.efficiency}%</span>
                <span className="eff-label">Current</span>
              </div>
            </div>
            <div className="eff-details">
              <div className="eff-detail-row">
                <span className="eff-detail-label">Peak Efficiency</span>
                <span className="eff-detail-value green">92.4%</span>
              </div>
              <div className="eff-detail-row">
                <span className="eff-detail-label">Average Today</span>
                <span className="eff-detail-value">{metrics.efficiency}%</span>
              </div>
              <div className="eff-detail-row">
                <span className="eff-detail-label">System Rating</span>
                <span className="eff-detail-value">8 kW</span>
              </div>
              <div className="eff-detail-row">
                <span className="eff-detail-label">Performance Ratio</span>
                <span className="eff-detail-value green">0.87</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={efficiencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(value) => [`${value}%`, "Efficiency"]}
                contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}
              />
              <Line type="monotone" dataKey="efficiency" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4, fill: "#16a34a" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* CO2 Savings */}
        <div className="monitoring-card">
          <div className="card-top">
            <h3>CO&#8322; Savings</h3>
            <span className="card-badge">Environmental Impact</span>
          </div>
          <div className="co2-summary">
            <div className="co2-big-number">
              <span className="co2-value">{(totalCO2Saved / 1000).toFixed(1)}T</span>
              <span className="co2-unit">CO&#8322; Saved (2026)</span>
            </div>
            <div className="co2-equivalents">
              <div className="co2-equiv-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                  <path d="M12 22c4-4 8-7 8-12a8 8 0 10-16 0c0 5 4 8 8 12z" />
                  <path d="M12 12V8" />
                </svg>
                <div>
                  <span className="co2-equiv-value">{treesEquivalent}</span>
                  <span className="co2-equiv-label">Trees Equivalent</span>
                </div>
              </div>
              <div className="co2-equiv-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                  <rect x="1" y="6" width="22" height="12" rx="2" />
                  <circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" />
                </svg>
                <div>
                  <span className="co2-equiv-value">{carsOffRoad}</span>
                  <span className="co2-equiv-label">Cars Off Road</span>
                </div>
              </div>
              <div className="co2-equiv-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <div>
                  <span className="co2-equiv-value">{(totalGeneration / 1000).toFixed(1)} MWh</span>
                  <span className="co2-equiv-label">Clean Energy</span>
                </div>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={co2Data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <Tooltip
                formatter={(value) => [`${value} kg`, "CO2 Saved"]}
                contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}
              />
              <Bar dataKey="saved" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* System Health */}
      <div className="monitoring-card">
        <div className="card-top">
          <h3>System Health Overview</h3>
          <span className="card-badge">All Systems</span>
        </div>
        <div className="health-grid">
          <SystemHealthItem name="Solar Panels" status="operational" percent={98} />
          <SystemHealthItem name="Inverter" status="operational" percent={96} />
          <SystemHealthItem name="Battery Bank" status={metrics.batteryHealth > 80 ? "operational" : "warning"} percent={Math.round(metrics.batteryHealth)} />
          <SystemHealthItem name="Grid Connection" status="operational" percent={99} />
          <SystemHealthItem name="Monitoring System" status="operational" percent={100} />
          <SystemHealthItem name="IoT Sensors" status="operational" percent={94} />
        </div>
      </div>
        </>
      )}
    </div>
  );
};

const MetricCard = ({ icon, label, value, status }) => {
  const iconMap = {
    output: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    voltage: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    current: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="2" x2="12" y2="22" />
        <path d="M17 7l-5-5-5 5" /><path d="M7 17l5 5 5-5" />
      </svg>
    ),
    frequency: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12h4l3-9 4 18 3-9h6" />
      </svg>
    ),
    battery: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="6" width="18" height="12" rx="2" />
        <line x1="23" y1="10" x2="23" y2="14" />
      </svg>
    ),
    export: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" />
        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
      </svg>
    ),
    import: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="17 9 21 5 17 1" /><path d="M3 5v4a4 4 0 004 4h14" />
        <polyline points="7 15 3 19 7 23" /><path d="M21 19v-4a4 4 0 00-4-4H3" />
      </svg>
    ),
    temp: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z" />
      </svg>
    ),
    efficiency: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  };

  return (
    <div className={`metric-card metric-${status}`}>
      <div className="metric-header">
        <div className="metric-icon">{iconMap[icon]}</div>
        <span className={`metric-status-dot status-${status}`}></span>
      </div>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
};

const SystemHealthItem = ({ name, status, percent }) => (
  <div className="health-item">
    <div className="health-item-top">
      <span className="health-name">{name}</span>
      <span className={`health-status health-${status}`}>
        {status === "operational" ? "Operational" : "Warning"}
      </span>
    </div>
    <div className="health-bar-track">
      <div
        className={`health-bar-fill health-bar-${status}`}
        style={{ width: `${percent}%` }}
      ></div>
    </div>
    <span className="health-percent">{percent}%</span>
  </div>
);

export default SolarMonitoring;
