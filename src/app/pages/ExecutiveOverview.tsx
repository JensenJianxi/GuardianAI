import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  TrendingUp,
  DollarSign,
  Target,
  Clock,
  Activity,
  AlertTriangle,
  Brain,
  Eye,
  ArrowUp,
  ArrowDown,
  Zap,
  CheckCircle,
  Shield,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { API_BASE, ApiDecision, formatUsd, normalizeApiDecision, parseApiPayload } from "../guardianApi";

function GlassCard({ children, title, icon, customBorder, badge }: { children: React.ReactNode; title: string; icon: React.ReactNode; customBorder?: boolean; badge?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative p-6 rounded-2xl border ${customBorder ? "border-red-500/30" : ""}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(20px)",
        border: customBorder ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
        boxShadow: customBorder ? "0 8px 32px rgba(239,68,68,0.2)" : "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-transparent" />
      {customBorder && <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/5 to-transparent" />}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            customBorder ? "bg-red-500/10 border-red-500/20" : "bg-cyan-500/10 border-cyan-500/20"
          }`}>
            {icon}
          </div>
          <h3 className={`text-sm font-bold ${customBorder ? "text-red-400" : "text-white"}`}>{title}</h3>
          {badge && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-full px-2 py-1">
              <span className="text-red-400 text-xs font-mono font-bold">{badge}</span>
            </div>
          )}
        </div>
        {children}
      </div>
    </motion.div>
  );
}

function KPICard({
  value,
  label,
  change,
  positiveIsGood = true,
  changeSuffix = "%",
}: {
  value: string;
  label: string;
  change?: number;
  positiveIsGood?: boolean;
  changeSuffix?: string;
}) {
  const isPositive = (change ?? 0) >= 0;
  const changeClass = positiveIsGood
    ? (isPositive ? "text-green-400" : "text-red-400")
    : (isPositive ? "text-red-400" : "text-green-400");

  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-cyan-400 mb-2 font-mono">{value}</div>
      <div className="text-slate-400 text-xs mb-3">{label}</div>
      {change !== undefined && (
        <div className={`flex items-center justify-center gap-1 text-xs font-bold ${changeClass}`}>
          {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(change).toFixed(1)}{changeSuffix}
        </div>
      )}
    </div>
  );
}

function formatImpactAmount(amount: number) {
  const absolute = Math.abs(amount);
  if (absolute >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return formatUsd(amount);
}

type ApiEvent = {
  event_id: string;
  user_id: string;
  amount?: number;
  decision: ApiDecision;
  unified_risk?: number;
  bms?: number;
  gmrs?: number;
  gtrs?: number;
  risk_prob?: number;
  geo?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    timestamp?: number;
  } | null;
  reason?: string;
  timestamp: string;
};

type ThroughputPoint = {
  time: string;
  normal: number;
  flagged: number;
};

type RadarPoint = {
  dimension: "Behavioral" | "Network" | "Transactional";
  value: number;
};

type GeoCluster = {
  label: string;
  count: number;
  avgRisk: number;
};

const countryNameFormatter =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const COUNTRY_GEOBOXES = [
  { code: "SG", latMin: 1.1, latMax: 1.5, lngMin: 103.6, lngMax: 104.1 },
  { code: "MY", latMin: 0.8, latMax: 7.5, lngMin: 99.6, lngMax: 119.4 },
  { code: "TH", latMin: 5.5, latMax: 20.6, lngMin: 97.2, lngMax: 105.8 },
  { code: "VN", latMin: 8.2, latMax: 23.5, lngMin: 102.1, lngMax: 109.6 },
  { code: "PH", latMin: 4.4, latMax: 21.3, lngMin: 116.8, lngMax: 126.7 },
  { code: "ID", latMin: -11.2, latMax: 6.3, lngMin: 94.7, lngMax: 141.2 },
  { code: "IN", latMin: 6.5, latMax: 35.8, lngMin: 68.0, lngMax: 97.5 },
  { code: "CN", latMin: 18.0, latMax: 53.7, lngMin: 73.5, lngMax: 135.1 },
  { code: "JP", latMin: 24.0, latMax: 45.7, lngMin: 122.5, lngMax: 153.9 },
  { code: "KR", latMin: 33.0, latMax: 38.8, lngMin: 124.5, lngMax: 131.9 },
  { code: "AU", latMin: -44.5, latMax: -10.0, lngMin: 112.0, lngMax: 154.0 },
  { code: "NZ", latMin: -47.5, latMax: -34.0, lngMin: 166.0, lngMax: 179.9 },
  { code: "GB", latMin: 49.8, latMax: 60.9, lngMin: -8.7, lngMax: 1.9 },
  { code: "IE", latMin: 51.3, latMax: 55.7, lngMin: -10.8, lngMax: -5.3 },
  { code: "FR", latMin: 41.0, latMax: 51.5, lngMin: -5.3, lngMax: 9.7 },
  { code: "DE", latMin: 47.2, latMax: 55.2, lngMin: 5.5, lngMax: 15.4 },
  { code: "NG", latMin: 4.2, latMax: 13.9, lngMin: 2.5, lngMax: 14.7 },
  { code: "ZA", latMin: -35.0, latMax: -22.0, lngMin: 16.4, lngMax: 33.0 },
  { code: "BR", latMin: -33.8, latMax: 5.3, lngMin: -74.2, lngMax: -34.7 },
  { code: "US", latMin: 24.5, latMax: 49.5, lngMin: -125.0, lngMax: -66.9 },
  { code: "CA", latMin: 41.7, latMax: 83.2, lngMin: -141.0, lngMax: -52.6 },
  { code: "MX", latMin: 14.4, latMax: 32.8, lngMin: -118.5, lngMax: -86.4 },
  { code: "AE", latMin: 22.5, latMax: 26.2, lngMin: 51.4, lngMax: 56.6 },
];

function inferCountryName(lat: number, lng: number) {
  const match = COUNTRY_GEOBOXES.find(
    (country) =>
      lat >= country.latMin &&
      lat <= country.latMax &&
      lng >= country.lngMin &&
      lng <= country.lngMax
  );

  if (!match) return null;
  return countryNameFormatter?.of(match.code) ?? match.code;
}

function decisionToRisk(decision: string) {
  if (decision === "FREEZE") return "CRITICAL";
  if (decision === "RISKED") return "HIGH";
  return "SAFE";
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundToOne(value: number) {
  return Number(value.toFixed(1));
}

function toUtcDayKey(input: string | number | Date) {
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return roundToOne(((current - previous) / previous) * 100);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function eventRiskScore(event: ApiEvent) {
  const explicitRisk = Number(event.risk_prob ?? event.unified_risk);
  if (Number.isFinite(explicitRisk)) {
    return Math.round(clamp01(explicitRisk) * 100);
  }

  if (event.decision === "FREEZE") return 92;
  if (event.decision === "RISKED") return 68;
  return 18;
}

function eventDecisionConfidence(event: ApiEvent) {
  const explicitRisk = Number(event.risk_prob ?? event.unified_risk);
  const normalizedRisk = Number.isFinite(explicitRisk)
    ? clamp01(explicitRisk)
    : eventRiskScore(event) / 100;

  return event.decision === "APPROVE"
    ? (1 - normalizedRisk) * 100
    : normalizedRisk * 100;
}

function buildThroughputData(events: ApiEvent[]): ThroughputPoint[] {
  const buckets = Array.from({ length: 6 }, (_, index) => ({
    time: `${String(index * 4).padStart(2, "0")}:00`,
    normal: 0,
    flagged: 0,
  }));

  for (const event of events) {
    const date = new Date(event.timestamp);
    if (!Number.isFinite(date.getTime())) continue;

    const bucketIndex = Math.min(5, Math.floor(date.getHours() / 4));
    if (event.decision === "APPROVE") {
      buckets[bucketIndex].normal += 1;
    } else {
      buckets[bucketIndex].flagged += 1;
    }
  }

  return buckets;
}

// Risk Triad maps directly to live score outputs:
// Behavioral = average biometric risk (1 - BMS)
// Network = average GMRS
// Transactional = average GTRS
function buildRiskTriadData(events: ApiEvent[]): RadarPoint[] {
  if (events.length === 0) {
    return [
      { dimension: "Behavioral", value: 0 },
      { dimension: "Network", value: 0 },
      { dimension: "Transactional", value: 0 },
    ];
  }

  const behavioral = average(
    events
      .map((event) => Number(event.bms))
      .filter((value) => Number.isFinite(value))
      .map((value) => (1 - clamp01(value)) * 100)
  );
  const network = average(
    events
      .map((event) => Number(event.gmrs))
      .filter((value) => Number.isFinite(value))
      .map((value) => clamp01(value) * 100)
  );
  const transactional = average(
    events
      .map((event) => Number(event.gtrs))
      .filter((value) => Number.isFinite(value))
      .map((value) => clamp01(value) * 100)
  );

  return [
    { dimension: "Behavioral", value: roundToOne(behavioral) },
    { dimension: "Network", value: roundToOne(network) },
    { dimension: "Transactional", value: roundToOne(transactional) },
  ];
}

function buildGeoClusters(events: ApiEvent[]): GeoCluster[] {
  const clusters = new Map<string, { count: number; totalRisk: number }>();

  for (const event of events) {
    const lat = Number(event.geo?.lat);
    const lng = Number(event.geo?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const label = inferCountryName(lat, lng) ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    const current = clusters.get(label) ?? { count: 0, totalRisk: 0 };
    current.count += 1;
    current.totalRisk += eventRiskScore(event);
    clusters.set(label, current);
  }

  return Array.from(clusters.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      avgRisk: roundToOne(value.totalRisk / value.count),
    }))
    .sort((left, right) => right.count - left.count || right.avgRisk - left.avgRisk)
    .slice(0, 5);
}

export function ExecutiveOverview() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [apiError, setApiError] = useState("");

  async function fetchEvents() {
    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const parsed = await parseApiPayload<ApiEvent[]>(res);
      const events = (Array.isArray(parsed) ? parsed : [])
        .map((event) => ({
          ...event,
          decision: normalizeApiDecision(event.decision),
        }))
        .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));

      setEvents(events);
      setApiError("");
    } catch (err) {
      console.error("Failed to fetch events:", err);
      setApiError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    const handleDataReset = () => {
      void fetchEvents();
    };

    window.addEventListener("guardian:data-reset", handleDataReset);

    return () => {
      clearInterval(interval);
      window.removeEventListener("guardian:data-reset", handleDataReset);
    };
  }, []);

  const todayKey = toUtcDayKey(new Date());
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = toUtcDayKey(yesterday);

  const todayEvents = events.filter((event) => toUtcDayKey(event.timestamp) === todayKey);
  const yesterdayEvents = events.filter((event) => toUtcDayKey(event.timestamp) === yesterdayKey);
  const blockedEvents = events.filter((event) => event.decision === "FREEZE");
  const reviewEvents = events.filter((event) => event.decision !== "APPROVE");

  const metrics = {
    totalTransactions: events.length,
    fraudPrevented: blockedEvents.reduce((sum, event) => sum + Number(event.amount ?? 0), 0),
    confidence: roundToOne(average(events.map(eventDecisionConfidence))),
    pendingWorkload: reviewEvents.length,
  };

  const kpiChanges = {
    volume: percentChange(todayEvents.length, yesterdayEvents.length),
    fraudPrevented: percentChange(
      todayEvents
        .filter((event) => event.decision === "FREEZE")
        .reduce((sum, event) => sum + Number(event.amount ?? 0), 0),
      yesterdayEvents
        .filter((event) => event.decision === "FREEZE")
        .reduce((sum, event) => sum + Number(event.amount ?? 0), 0)
    ),
    confidence: roundToOne(
      average(todayEvents.map(eventDecisionConfidence)) -
      average(yesterdayEvents.map(eventDecisionConfidence))
    ),
    alerts: percentChange(
      todayEvents.filter((event) => event.decision !== "APPROVE").length,
      yesterdayEvents.filter((event) => event.decision !== "APPROVE").length
    ),
  };

  const liveTransactions = events.slice(0, 10).map((event) => ({
    id: event.event_id,
    amount: Number(event.amount ?? 0),
    score: eventRiskScore(event),
    risk: decisionToRisk(event.decision),
    timestamp: new Date(event.timestamp).getTime() || Date.now(),
  }));

  const highRiskTransactions = reviewEvents.slice(0, 5).map((event) => ({
    id: event.event_id,
    amount: Number(event.amount ?? 0),
    score: eventRiskScore(event),
    risk: decisionToRisk(event.decision),
    behavioral: `BMS: ${Number(event.bms ?? 0).toFixed(2)} | GMRS: ${Number(event.gmrs ?? 0).toFixed(2)}`,
    network: `GTRS: ${Number(event.gtrs ?? 0).toFixed(2)}`,
    processedIn: "—",
  }));

  const throughputData = buildThroughputData(todayEvents);
  const riskTriadData = buildRiskTriadData(todayEvents);
  const geoClusters = buildGeoClusters(events);

  return (
    <div className="min-h-full flex flex-col" style={{ background: "#0b0e14" }}>
      {/* Header */}
      <header className="flex-shrink-0 flex flex-col gap-3 border-b border-cyan-500/12 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Brain className="w-5 h-5 text-cyan-400" />
          <span className="text-white text-lg font-bold">Executive Overview</span>
          <span className="text-slate-500 text-sm">— AI Guardian Platform</span>
        </div>
        <div className="flex items-center gap-2">
          {apiError ? (
            <>
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-400 text-xs font-mono">{apiError}</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-mono">LIVE</span>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6 sm:space-y-6">
        
        {/* Top-Row KPI Widgets */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GlassCard title="Transaction Volume" icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}>
            <KPICard 
              value={metrics.totalTransactions.toLocaleString()} 
              label="Total Processed" 
              change={kpiChanges.volume}
            />
          </GlassCard>

          <GlassCard title="Financial Impact" icon={<DollarSign className="w-5 h-5 text-green-400" />}>
            <KPICard 
              value={formatImpactAmount(metrics.fraudPrevented)} 
              label="Fraud Prevented" 
              change={kpiChanges.fraudPrevented}
            />
          </GlassCard>

          <GlassCard title="AI Confidence" icon={<Target className="w-5 h-5 text-purple-400" />}>
            <KPICard 
              value={`${metrics.confidence.toFixed(1)}%`} 
              label="Estimated from live decisions" 
              change={kpiChanges.confidence}
              changeSuffix=" pts"
            />
          </GlassCard>

          <GlassCard title="Active Alerts" icon={<Clock className="w-5 h-5 text-red-400" />} customBorder={true}>
            <KPICard 
              value={metrics.pendingWorkload.toString()} 
              label="Review Queue" 
              change={kpiChanges.alerts}
              positiveIsGood={false}
            />
            <button 
              onClick={() => navigate('/manual-review')}
              className="mt-3 w-full px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Eye className="w-3 h-3" />
              Review Now
            </button>
          </GlassCard>
        </div>

        {/* Central Activity Graph */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <GlassCard title="Recent High-Risk Transactions" icon={<Eye className="w-5 h-5 text-red-400" />} badge={highRiskTransactions.length.toString()}>
            <div className="h-64 overflow-y-auto space-y-2 p-2">
              {highRiskTransactions.map((tx) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-lg border border-slate-700 hover:border-cyan-500/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-cyan-300 text-xs font-mono font-bold">{tx.id}</div>
                        <div className="text-slate-400 text-xs">{formatUsd(tx.amount)}</div>
                      </div>
                    </div>
                  <div className="text-right">
                    <div className={`text-xs font-bold ${
                      tx.risk === "CRITICAL" ? "text-red-400" : "text-orange-400"
                    }`}>
                        {tx.score} {tx.risk}
                    </div>
                  </div>
                </div>
                  
                  {/* Risk Summary */}
                  <div className="text-xs text-slate-400 mb-2 font-mono">
                    {tx.behavioral} | {tx.network}
                  </div>
                  
                  {/* Action Group */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">Processed in {tx.processedIn}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/manual-review?case=${tx.id}&action=approve`)}
                        className="p-1.5 bg-green-500/10 border border-green-500/20 rounded text-green-400 hover:bg-green-500/20 transition-all"
                        title="Open in Manual Review"
                      >
                        <CheckCircle className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => navigate(`/manual-review?case=${tx.id}&action=freeze`)}
                        className="p-1.5 bg-red-500/10 border border-red-500/20 rounded text-red-400 hover:bg-red-500/20 transition-all"
                        title="Escalate Freeze Review"
                      >
                        <Shield className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => navigate(`/manual-review?case=${tx.id}`)}
                        className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400 hover:bg-cyan-500/20 transition-all"
                        title="Deep Dive"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>

          <GlassCard title="Live Transaction Ingestion" icon={<Zap className="w-5 h-5 text-green-400" />}>
            <div className="h-64 overflow-hidden relative cursor-pointer" onClick={() => navigate('/ops')}>
              <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-xs font-mono font-bold">LIVE</span>
              </div>
              <div className="h-full overflow-y-auto space-y-1 p-2">
                {liveTransactions.map((tx, index) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-2 rounded border cursor-pointer transition-all group ${
                      tx.risk === "SAFE" 
                        ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40" 
                        : tx.risk === "HIGH"
                        ? "bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40"
                        : "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
                    }`}
                    onClick={() => tx.score > 70 && navigate(`/manual-review?case=${tx.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          tx.risk === "SAFE" ? "bg-green-400" :
                          tx.risk === "HIGH" ? "bg-orange-400" : "bg-red-400"
                        }`} />
                        <span className={`text-xs font-mono font-bold ${
                          tx.risk === "SAFE" ? "text-green-400" :
                          tx.risk === "HIGH" ? "text-orange-400" : "text-red-400"
                        }`}>
                          {tx.id}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-bold ${
                          tx.risk === "SAFE" ? "text-green-400" :
                          tx.risk === "HIGH" ? "text-orange-400" : "text-red-400"
                        }`}>
                          {tx.score}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-slate-400 text-xs">{formatUsd(tx.amount)}</span>
                      <span className="text-slate-500 text-xs font-mono">
                        {new Date(tx.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {tx.score > 70 && (
                      <div className="mt-1 text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Quick Investigate →
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* System Throughput */}
        <GlassCard title="System Throughput" icon={<Activity className="w-5 h-5 text-cyan-400" />}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <defs>
                    <linearGradient id="normalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="flaggedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: "rgba(15,20,32,0.9)", 
                      border: "1px solid rgba(6,182,212,0.3)", 
                      borderRadius: "8px",
                      fontSize: "11px"
                    }} 
                  />
                  <Area type="monotone" dataKey="normal" stroke="#06b6d4" fill="url(#normalGradient)" />
                  <Area type="monotone" dataKey="flagged" stroke="#ef4444" fill="url(#flaggedGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
        </GlassCard>

        {/* Risk Triad Analysis */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <GlassCard title="Risk Triad Analysis" icon={<Brain className="w-5 h-5 text-cyan-400" />}>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={riskTriadData}>
                  <PolarGrid stroke="#475569" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#475569", fontSize: 9 }} />
                  <Radar dataKey="value" stroke="#06b6d4" fill="rgba(6,182,212,0.3)" strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Behavioral = avg biometric risk (1 - BMS), Network = avg GMRS, Transactional = avg GTRS from live events.
            </p>
          </GlassCard>

          {/* Geospatial Insight */}
          <GlassCard title="Geospatial Insight" icon={<MapPin className="w-5 h-5 text-cyan-400" />}>
            <div className="h-64 relative bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-sm mb-4">Live country distribution from captured events</p>
                  {geoClusters.length > 0 ? (
                    <div className="space-y-2">
                      {geoClusters.map((cluster) => (
                        <div key={cluster.label} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{cluster.label}</span>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              cluster.avgRisk > 80 ? "bg-red-400" :
                              cluster.avgRisk > 60 ? "bg-orange-400" : "bg-yellow-400"
                            }`} />
                            <span className="text-slate-400 font-mono">{cluster.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">No geolocation telemetry available in the current event feed.</p>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
