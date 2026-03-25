import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle,
  Network,
  RefreshCw,
  ShieldAlert,
  Sliders,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { motion } from "motion/react";
import {
  API_BASE,
  ApiDecision,
  formatUsd,
  normalizeApiDecision,
  parseApiPayload,
} from "../guardianApi";

type ApiSensitivityEvent = {
  event_id: string;
  user_id: string;
  amount?: number;
  decision: ApiDecision;
  risk_prob?: number;
  unified_risk?: number;
  bms?: number;
  gmrs?: number;
  gtrs?: number;
  reason?: string;
  timestamp: string;
  top_signals?: string[];
};

type TimeBucket = {
  label: string;
  reviews: number;
  freezes: number;
  avgRisk: number;
  avgConfidence: number;
};

type PressureBar = {
  label: string;
  value: number;
  color: string;
};

type TooltipEntry = {
  color: string;
  dataKey: string;
  value: number;
  name?: string;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
};

const SENSITIVITY_OVERRIDE_STORAGE_KEY = "guardian_ai_sensitivity_override";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function safeTimestamp(iso: string) {
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function roundToOne(value: number) {
  return Number(value.toFixed(1));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readStoredSensitivityOverride() {
  if (typeof window === "undefined") return null;

  const storedValue = window.localStorage.getItem(
    SENSITIVITY_OVERRIDE_STORAGE_KEY
  );
  if (!storedValue) return null;

  const parsedValue = Number(storedValue);
  if (!Number.isFinite(parsedValue)) return null;

  return Math.max(0, Math.min(100, parsedValue));
}

function toRiskScore(event: ApiSensitivityEvent) {
  const explicit = Number(event.risk_prob ?? event.unified_risk);
  if (Number.isFinite(explicit)) {
    return clamp01(explicit) * 100;
  }

  return (
    (1 - clamp01(Number(event.bms ?? 0.5))) * 40 +
    clamp01(Number(event.gmrs ?? 0.05)) * 35 +
    clamp01(Number(event.gtrs ?? 0.05)) * 25
  );
}

function toDecisionConfidence(event: ApiSensitivityEvent) {
  const explicit = Number(event.risk_prob ?? event.unified_risk);
  const risk = Number.isFinite(explicit) ? clamp01(explicit) : toRiskScore(event) / 100;
  return event.decision === "APPROVE" ? (1 - risk) * 100 : risk * 100;
}

function toBehavioralPressure(event: ApiSensitivityEvent) {
  return (1 - clamp01(Number(event.bms ?? 0))) * 100;
}

function toNetworkPressure(event: ApiSensitivityEvent) {
  return clamp01(Number(event.gmrs ?? 0)) * 100;
}

function toTransactionalPressure(event: ApiSensitivityEvent) {
  return clamp01(Number(event.gtrs ?? 0)) * 100;
}

function build24HourBuckets(events: ApiSensitivityEvent[]): TimeBucket[] {
  const buckets = Array.from({ length: 6 }, (_, index) => ({
    label: `${String(index * 4).padStart(2, "0")}:00`,
    reviews: 0,
    freezes: 0,
    avgRisk: 0,
    avgConfidence: 0,
    samples: 0,
  }));

  for (const event of events) {
    const timestamp = safeTimestamp(event.timestamp);
    if (!timestamp) continue;

    const bucketIndex = Math.min(5, Math.floor(new Date(timestamp).getHours() / 4));
    const bucket = buckets[bucketIndex];
    bucket.reviews += event.decision === "APPROVE" ? 0 : 1;
    bucket.freezes += event.decision === "FREEZE" ? 1 : 0;
    bucket.avgRisk += toRiskScore(event);
    bucket.avgConfidence += toDecisionConfidence(event);
    bucket.samples += 1;
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    reviews: bucket.reviews,
    freezes: bucket.freezes,
    avgRisk: bucket.samples ? roundToOne(bucket.avgRisk / bucket.samples) : 0,
    avgConfidence: bucket.samples
      ? roundToOne(bucket.avgConfidence / bucket.samples)
      : 0,
  }));
}

function build7DayBuckets(events: ApiSensitivityEvent[]): TimeBucket[] {
  const today = new Date();
  const buckets = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - offset));
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-GB", { weekday: "short" }),
      reviews: 0,
      freezes: 0,
      avgRisk: 0,
      avgConfidence: 0,
      samples: 0,
    };
  });

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const event of events) {
    const timestamp = safeTimestamp(event.timestamp);
    if (!timestamp) continue;
    const key = new Date(timestamp).toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.reviews += event.decision === "APPROVE" ? 0 : 1;
    bucket.freezes += event.decision === "FREEZE" ? 1 : 0;
    bucket.avgRisk += toRiskScore(event);
    bucket.avgConfidence += toDecisionConfidence(event);
    bucket.samples += 1;
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    reviews: bucket.reviews,
    freezes: bucket.freezes,
    avgRisk: bucket.samples ? roundToOne(bucket.avgRisk / bucket.samples) : 0,
    avgConfidence: bucket.samples
      ? roundToOne(bucket.avgConfidence / bucket.samples)
      : 0,
  }));
}

function TooltipCard({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{
        background: "#0f1420",
        borderColor: "rgba(6,182,212,0.3)",
        color: "#e2e8f0",
      }}
    >
      <p className="mb-1 text-slate-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color, fontWeight: 600 }}>
          {(entry.name ?? entry.dataKey).toString()}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function sensitivityBand(score: number) {
  if (score < 25) {
    return {
      label: "Relaxed",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.1)",
      border: "rgba(34,197,94,0.3)",
    };
  }
  if (score < 60) {
    return {
      label: "Balanced",
      color: "#06b6d4",
      bg: "rgba(6,182,212,0.1)",
      border: "rgba(6,182,212,0.3)",
    };
  }
  if (score < 80) {
    return {
      label: "Elevated",
      color: "#f97316",
      bg: "rgba(249,115,22,0.1)",
      border: "rgba(249,115,22,0.3)",
    };
  }
  return {
    label: "Aggressive",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
  };
}

export function SensitivityControl() {
  const [events, setEvents] = useState<ApiSensitivityEvent[]>([]);
  const [apiError, setApiError] = useState("");
  const [activeWindow, setActiveWindow] = useState<"24h" | "7d">("24h");
  const [sensitivityOverride, setSensitivityOverride] = useState<number | null>(
    () => readStoredSensitivityOverride()
  );

  async function fetchEvents() {
    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const parsed = await parseApiPayload<ApiSensitivityEvent[]>(response);
      const normalized = (Array.isArray(parsed) ? parsed : [])
        .map((event) => ({
          ...event,
          decision: normalizeApiDecision(event.decision),
        }))
        .sort((left, right) => safeTimestamp(right.timestamp) - safeTimestamp(left.timestamp));

      setEvents(normalized);
      setApiError("");
    } catch (error) {
      console.error("Failed to fetch live sensitivity metrics:", error);
      setApiError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void fetchEvents();
    const interval = setInterval(() => {
      void fetchEvents();
    }, 5000);
    const handleDataReset = () => {
      void fetchEvents();
    };

    window.addEventListener("guardian:data-reset", handleDataReset);
    return () => {
      clearInterval(interval);
      window.removeEventListener("guardian:data-reset", handleDataReset);
    };
  }, []);

  const metrics = useMemo(() => {
    const total = events.length;
    const reviewEvents = events.filter((event) => event.decision !== "APPROVE");
    const freezeEvents = events.filter((event) => event.decision === "FREEZE");
    const approvedEvents = events.filter((event) => event.decision === "APPROVE");

    const accountCounts = new Map<string, number>();
    const repeatedEventCounts = new Map<string, number>();
    for (const event of events) {
      const accountId = event.user_id || "UNKNOWN";
      accountCounts.set(accountId, (accountCounts.get(accountId) ?? 0) + 1);
    }
    for (const [accountId, count] of accountCounts.entries()) {
      if (count > 1) {
        repeatedEventCounts.set(accountId, count);
      }
    }

    const repeatedTargetAccounts = repeatedEventCounts.size;
    const repeatedTargetEvents = Array.from(repeatedEventCounts.values()).reduce(
      (sum, value) => sum + value,
      0
    );
    const repeatedTargetShare = total
      ? roundToOne((repeatedTargetEvents / total) * 100)
      : 0;

    const avgConfidence = roundToOne(average(events.map(toDecisionConfidence)));
    const avgRisk = roundToOne(average(events.map(toRiskScore)));
    const behavioralPressure = roundToOne(
      average(events.map(toBehavioralPressure))
    );
    const networkPressure = roundToOne(average(events.map(toNetworkPressure)));
    const transactionalPressure = roundToOne(
      average(events.map(toTransactionalPressure))
    );

    const topSignalCounts = new Map<string, number>();
    for (const event of events) {
      const signals =
        Array.isArray(event.top_signals) && event.top_signals.length > 0
          ? event.top_signals
          : ["NO_SIGNALS"];
      for (const signal of signals) {
        topSignalCounts.set(signal, (topSignalCounts.get(signal) ?? 0) + 1);
      }
    }
    const topSignal = Array.from(topSignalCounts.entries()).sort(
      (left, right) => right[1] - left[1]
    )[0];

    const reviewRate = total ? roundToOne((reviewEvents.length / total) * 100) : 0;
    const freezeRate = total ? roundToOne((freezeEvents.length / total) * 100) : 0;
    const approvalRate = total
      ? roundToOne((approvedEvents.length / total) * 100)
      : 0;

    const recommendedSensitivity = Math.max(
      0,
      Math.min(
        100,
        roundToOne(
          32 +
            reviewRate * 0.45 +
            freezeRate * 0.35 +
            repeatedTargetShare * 0.4 +
            behavioralPressure * 0.1 +
            networkPressure * 0.12 +
            transactionalPressure * 0.1 +
            (100 - avgConfidence) * 0.15
        )
      )
    );

    const lastEventTimestamp = events[0]?.timestamp ?? "";
    const lastEventAmount = Number(events[0]?.amount ?? 0);

    return {
      total,
      reviewRate,
      freezeRate,
      approvalRate,
      avgConfidence,
      avgRisk,
      behavioralPressure,
      networkPressure,
      transactionalPressure,
      repeatedTargetAccounts,
      repeatedTargetShare,
      recommendedSensitivity,
      topSignal: topSignal?.[0] ?? "NO_SIGNALS",
      topSignalCount: topSignal?.[1] ?? 0,
      lastEventTimestamp,
      lastEventAmount,
    };
  }, [events]);

  const pressureBars = useMemo<PressureBar[]>(
    () => [
      { label: "Behavioral", value: metrics.behavioralPressure, color: "#06b6d4" },
      { label: "Network", value: metrics.networkPressure, color: "#f97316" },
      {
        label: "Transactional",
        value: metrics.transactionalPressure,
        color: "#a855f7",
      },
      {
        label: "Repetition",
        value: metrics.repeatedTargetShare,
        color: "#ef4444",
      },
    ],
    [
      metrics.behavioralPressure,
      metrics.networkPressure,
      metrics.repeatedTargetShare,
      metrics.transactionalPressure,
    ]
  );

  const chart24h = useMemo(() => build24HourBuckets(events), [events]);
  const chart7d = useMemo(() => build7DayBuckets(events), [events]);
  const chartData = activeWindow === "24h" ? chart24h : chart7d;
  const activeSensitivity = sensitivityOverride ?? metrics.recommendedSensitivity;
  const band = sensitivityBand(activeSensitivity);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (sensitivityOverride === null) {
      window.localStorage.removeItem(SENSITIVITY_OVERRIDE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      SENSITIVITY_OVERRIDE_STORAGE_KEY,
      sensitivityOverride.toFixed(0)
    );
  }, [sensitivityOverride]);

  const recommendationDrivers = useMemo(() => {
    const reasons: string[] = [];
    if (metrics.repeatedTargetShare >= 25) {
      reasons.push(
        `Repeated transfers to the same account make up ${metrics.repeatedTargetShare.toFixed(
          1
        )}% of live volume.`
      );
    }
    if (metrics.networkPressure >= 35) {
      reasons.push(
        `Average network pressure is ${metrics.networkPressure.toFixed(
          1
        )}, which suggests stronger mule screening.`
      );
    }
    if (metrics.transactionalPressure >= 35) {
      reasons.push(
        `Transactional pressure is ${metrics.transactionalPressure.toFixed(
          1
        )}, indicating elevated transfer-risk patterns.`
      );
    }
    if (metrics.avgConfidence <= 70) {
      reasons.push(
        `Decision confidence has compressed to ${metrics.avgConfidence.toFixed(
          1
        )}%, so tighter review thresholds are recommended.`
      );
    }
    if (reasons.length === 0) {
      reasons.push(
        `Current live mix is stable: ${metrics.approvalRate.toFixed(
          1
        )}% approvals with limited repeated-target pressure.`
      );
    }
    return reasons.slice(0, 4);
  }, [
    metrics.approvalRate,
    metrics.avgConfidence,
    metrics.networkPressure,
    metrics.repeatedTargetShare,
    metrics.transactionalPressure,
  ]);

  return (
    <div className="min-h-full" style={{ background: "#0b0e14" }}>
      <header
        className="flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        style={{ borderColor: "rgba(6,182,212,0.12)" }}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span className="text-white text-sm" style={{ fontWeight: 600 }}>
            Guardian AI Sensitivity
          </span>
          <span className="text-slate-500 text-xs">
            — Live calibration view derived from /events
          </span>
        </div>
        <div className="flex items-center gap-3">
          {metrics.lastEventTimestamp ? (
            <span className="text-xs text-slate-500">
              Last event {new Date(metrics.lastEventTimestamp).toLocaleTimeString()}
            </span>
          ) : null}
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/20"
            style={{ fontWeight: 600 }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {apiError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {apiError}
          </div>
        ) : null}

        <div
          className="rounded-2xl border p-6"
          style={{
            background: "rgba(6,182,212,0.02)",
            borderColor: "rgba(6,182,212,0.12)",
          }}
        >
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-white">Sensitivity Control</h2>
              <p className="mt-0.5 text-sm text-slate-400">
                Live recommendation comes from actual events. You can move the control below to set a manual sensitivity override for this browser.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="rounded-xl border px-4 py-2 text-sm"
                style={{
                  background: band.bg,
                  borderColor: band.border,
                  color: band.color,
                  fontWeight: 700,
                }}
              >
                {band.label} · {activeSensitivity.toFixed(0)}%
              </div>
              {sensitivityOverride !== null ? (
                <button
                  onClick={() => setSensitivityOverride(null)}
                  className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/20"
                  style={{ fontWeight: 600 }}
                >
                  Use Live Recommendation
                </button>
              ) : (
                <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                  Live-linked
                </div>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-white" style={{ fontWeight: 600 }}>
                Current sensitivity
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Higher sensitivity means more aggressive review and freeze behavior.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-300">
                Recommended {metrics.recommendedSensitivity.toFixed(1)}%
              </span>
              <span
                className="rounded-lg border px-3 py-1"
                style={{
                  borderColor: band.border,
                  background: band.bg,
                  color: band.color,
                  fontWeight: 700,
                }}
              >
                Active {activeSensitivity.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="mb-6">
            <div className="relative h-8">
              <div
                className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full"
                style={{ background: "rgba(30,41,59,0.8)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${activeSensitivity}%` }}
                  style={{
                    background:
                      "linear-gradient(to right, #22c55e, #06b6d4, #f97316, #ef4444)",
                  }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={activeSensitivity}
                onChange={(event) =>
                  setSensitivityOverride(Number(event.target.value))
                }
                aria-label="Adjust AI sensitivity"
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
              />
              <div
                className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
                style={{
                  left: `calc(${activeSensitivity}% - 10px)`,
                  background: band.color,
                  boxShadow: `0 0 12px ${band.color}80`,
                }}
              />
            </div>
            <div className="mt-3 flex justify-between">
              {["Relaxed", "Balanced", "Elevated", "Aggressive"].map((label) => (
                <span key={label} className="text-xs text-slate-500">
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-cyan-500/10 bg-[#0f1420] px-4 py-3 text-xs text-slate-300">
              {sensitivityOverride === null
                ? "The control is currently following the live recommendation from your actual event mix."
                : "Manual override is active for this browser. Use “Use Live Recommendation” to snap back to the live calculated setting."}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              {
                label: "Review Rate",
                value: `${metrics.reviewRate.toFixed(1)}%`,
                tone: "text-orange-400",
                icon: <AlertTriangle className="w-3.5 h-3.5" />,
              },
              {
                label: "Freeze Rate",
                value: `${metrics.freezeRate.toFixed(1)}%`,
                tone: "text-red-400",
                icon: <ShieldAlert className="w-3.5 h-3.5" />,
              },
              {
                label: "AI Confidence",
                value: `${metrics.avgConfidence.toFixed(1)}%`,
                tone: "text-cyan-400",
                icon: <Brain className="w-3.5 h-3.5" />,
              },
              {
                label: "Repeated-target share",
                value: `${metrics.repeatedTargetShare.toFixed(1)}%`,
                tone: "text-purple-300",
                icon: <Network className="w-3.5 h-3.5" />,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border p-4"
                style={{
                  background: "rgba(15,20,32,0.6)",
                  borderColor: "rgba(6,182,212,0.1)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={stat.tone}>{stat.icon}</span>
                  <span className="text-xs text-slate-400">{stat.label}</span>
                </div>
                <p className={`text-2xl ${stat.tone}`} style={{ fontWeight: 700 }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div
            className="rounded-2xl border p-5"
            style={{
              background: "rgba(249,115,22,0.02)",
              borderColor: "rgba(249,115,22,0.12)",
            }}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-white">Review Pressure</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Live non-approve load and freeze volume
                </p>
              </div>
              <div className="flex gap-1.5">
                {(["24h", "7d"] as const).map((window) => (
                  <button
                    key={window}
                    onClick={() => setActiveWindow(window)}
                    className={`rounded px-2 py-1 text-xs transition-all ${
                      activeWindow === window
                        ? "border border-orange-500/30 bg-orange-500/20 text-orange-300"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {window.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(249,115,22,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#475569", fontSize: 10 }} />
                  <Tooltip content={<TooltipCard />} />
                  <Line
                    type="monotone"
                    dataKey="reviews"
                    name="Reviews"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#f97316" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="freezes"
                    name="Freezes"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#ef4444" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={{
              background: "rgba(6,182,212,0.02)",
              borderColor: "rgba(6,182,212,0.12)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-white">Risk and Confidence</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Average live risk score vs decision confidence
                </p>
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300">
                {metrics.total} events
              </div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(6,182,212,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#475569", fontSize: 10 }} />
                  <Tooltip content={<TooltipCard />} />
                  <Line
                    type="monotone"
                    dataKey="avgRisk"
                    name="Avg Risk"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#06b6d4" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgConfidence"
                    name="Avg Confidence"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#22c55e" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl border p-6"
          style={{
            background: "rgba(6,182,212,0.03)",
            borderColor: "rgba(6,182,212,0.14)",
          }}
        >
          <div className="mb-5 flex items-center gap-3">
            <Brain className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-white">Live Calibration Inputs</h3>
              <p className="text-sm text-slate-400">
                These factors are pushing the current recommendation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Top signal",
                value: `${metrics.topSignal} (${metrics.topSignalCount})`,
                icon: <Zap className="w-3.5 h-3.5 text-cyan-400" />,
              },
              {
                label: "Repeated accounts",
                value: metrics.repeatedTargetAccounts.toString(),
                icon: <Network className="w-3.5 h-3.5 text-orange-400" />,
              },
              {
                label: "Latest amount",
                value: formatUsd(metrics.lastEventAmount),
                icon: <Activity className="w-3.5 h-3.5 text-green-400" />,
              },
              {
                label: "Approval rate",
                value: `${metrics.approvalRate.toFixed(1)}%`,
                icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border p-4"
                style={{
                  background: "rgba(15,20,32,0.65)",
                  borderColor: "rgba(6,182,212,0.08)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  {item.icon}
                  <span className="text-xs text-slate-500">{item.label}</span>
                </div>
                <p className="break-words text-sm text-white" style={{ fontWeight: 700 }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-cyan-500/10 bg-[#0f1420] p-4">
            <p className="mb-3 text-xs font-bold text-cyan-300">
              Recommendation drivers
            </p>
            <div className="space-y-2">
              {recommendationDrivers.map((reason) => (
                <div key={reason} className="flex items-start gap-2 text-sm text-slate-300">
                  <TrendingUp className="mt-0.5 h-3.5 w-3.5 text-cyan-400" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl border p-6"
          style={{
            background: "rgba(15,20,32,0.6)",
            borderColor: "rgba(6,182,212,0.08)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-white">Live Pressure Mix</h3>
              <p className="text-sm text-slate-400">
                Real score components feeding the sensitivity recommendation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={pressureBars}
                  margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(6,182,212,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#475569", fontSize: 10 }} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {pressureBars.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3">
              {pressureBars.map((bar) => (
                <div key={bar.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{bar.label}</span>
                    <span className="font-mono" style={{ color: bar.color, fontWeight: 700 }}>
                      {bar.value.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      animate={{ width: `${bar.value}%` }}
                      className="h-full rounded-full"
                      style={{ background: bar.color }}
                    />
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-cyan-500/10 bg-[#0b0e14] p-4">
                <p className="mb-2 text-xs font-bold text-cyan-300">
                  What this means
                </p>
                <p className="text-sm leading-relaxed text-slate-300">
                  The admin settings page is now observational: it uses actual event outcomes, average BMS/GMRS/GTRS, repeated-target concentration, and live decision confidence to recommend a sensitivity band instead of simulating fake false-positive and fraud-prevented numbers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
