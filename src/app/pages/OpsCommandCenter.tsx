import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle,
  Eye,
  ExternalLink,
  Fingerprint,
  Globe,
  MousePointerClick,
  Network,
  Scan,
  Search,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  XCircle,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  API_BASE,
  ApiDecision,
  formatUsd,
  normalizeApiDecision,
  parseApiPayload,
} from "../guardianApi";
import { DrawerEvent, TransactionDrawer } from "../components/TransactionDrawer";

type ApiOpsEvent = {
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
  capture_mode?: string;
  geo?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    timestamp?: number;
  } | null;
  geo_distance_km?: number | null;
  device_platform?: string;
  touch_capable?: boolean;
  secure_context?: boolean;
  device_fingerprint?: string;
  motion_capture_status?: string;
  motion_sample_count?: number;
};

type AccountRollup = {
  accountId: string;
  events: number;
  blocked: number;
  risked: number;
  avgRisk: number;
  totalAmount: number;
};

type SignalRollup = {
  name: string;
  count: number;
};

type DeviceRollup = {
  platform: string;
  count: number;
};

function formatEventTime(iso: string) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "Unknown";
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventDate(iso: string) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "Unknown";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildLocationLabel(event: ApiOpsEvent) {
  if (event.geo?.lat != null && event.geo?.lng != null) {
    return `${Number(event.geo.lat).toFixed(3)}, ${Number(event.geo.lng).toFixed(3)}`;
  }
  if (event.geo_distance_km != null) {
    return `${Number(event.geo_distance_km).toFixed(2)} km from reference`;
  }
  return "Unavailable";
}

function toRiskScore(event: ApiOpsEvent) {
  const score = Number(event.risk_prob ?? event.unified_risk ?? 0);
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function formatScorePercent(value: number) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return `${pct.toFixed(1)}%`;
}

function decisionTone(decision: ApiDecision) {
  if (decision === "FREEZE") {
    return {
      bg: "rgba(239,68,68,0.05)",
      border: "rgba(239,68,68,0.25)",
      text: "text-red-400",
      chip: "bg-red-500/15 border-red-500/30 text-red-400",
    };
  }
  if (decision === "RISKED") {
    return {
      bg: "rgba(249,115,22,0.05)",
      border: "rgba(249,115,22,0.18)",
      text: "text-orange-400",
      chip: "bg-orange-500/15 border-orange-500/30 text-orange-400",
    };
  }
  return {
    bg: "rgba(6,182,212,0.02)",
    border: "rgba(6,182,212,0.08)",
    text: "text-green-400",
    chip: "bg-green-500/15 border-green-500/30 text-green-400",
  };
}

function toDrawerEvent(event: ApiOpsEvent): DrawerEvent {
  const decision = normalizeApiDecision(event.decision);
  return {
    id: event.event_id,
    timestamp: formatEventDate(event.timestamp),
    isoTimestamp: event.timestamp,
    txId: event.event_id,
    amount: Number(event.amount ?? 0),
    decision,
    riskScore: toRiskScore(event),
    riskProb: Number(event.risk_prob ?? 0),
    unifiedRisk: Number(event.unified_risk ?? 0),
    accountId: event.user_id || "UNKNOWN",
    reason: event.reason || "No reasoning returned by the backend.",
    bms: Number(event.bms ?? 0),
    gmrs: Number(event.gmrs ?? 0),
    gtrs: Number(event.gtrs ?? 0),
    topSignals: Array.isArray(event.top_signals) ? event.top_signals : [],
    captureMode: String(event.capture_mode || "unknown"),
    devicePlatform: String(event.device_platform || "unknown"),
    touchCapable: Boolean(event.touch_capable),
    secureContext: Boolean(event.secure_context),
    deviceHash: String(event.device_fingerprint || "Unavailable"),
    motionStatus: String(event.motion_capture_status || "unknown"),
    motionSampleCount: Number(event.motion_sample_count ?? 0),
    locationLabel: buildLocationLabel(event),
    geoDistanceKm:
      event.geo_distance_km == null ? null : Number(event.geo_distance_km),
  };
}

function DecisionBadge({ decision }: { decision: ApiDecision }) {
  const normalized = normalizeApiDecision(decision);
  const config = {
    APPROVE: {
      className: "bg-green-500/15 border-green-500/30 text-green-400",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    RISKED: {
      className: "bg-orange-500/15 border-orange-500/30 text-orange-400",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    FREEZE: {
      className: "bg-red-500/15 border-red-500/30 text-red-400",
      icon: <XCircle className="h-3 w-3" />,
    },
  }[normalized];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${config.className}`}
      style={{ fontWeight: 600 }}
    >
      {config.icon}
      {normalized}
    </span>
  );
}

function ProgressBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono" style={{ color, fontWeight: 700 }}>
          {formatScorePercent(value)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-900">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function OpsCommandCenter() {
  const [events, setEvents] = useState<DrawerEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<DrawerEvent | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [apiError, setApiError] = useState("");
  const [actionLog, setActionLog] = useState<
    { txId: string; action: string; time: string }[]
  >([]);

  async function fetchEvents() {
    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const parsed = await parseApiPayload<ApiOpsEvent[]>(response);
      const mapped = (Array.isArray(parsed) ? parsed : [])
        .map(toDrawerEvent)
        .sort(
          (left, right) =>
            Date.parse(right.isoTimestamp) - Date.parse(left.isoTimestamp)
        );

      setEvents(mapped);
      setSelectedEventId((current) =>
        current && mapped.some((event) => event.id === current)
          ? current
          : mapped[0]?.id ?? null
      );
      setApiError("");
    } catch (error) {
      console.error("Failed to fetch Ops event feed:", error);
      setApiError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void fetchEvents();
    const handleDataReset = () => {
      void fetchEvents();
    };
    window.addEventListener("guardian:data-reset", handleDataReset);

    return () => {
      window.removeEventListener("guardian:data-reset", handleDataReset);
    };
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      void fetchEvents();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLive]);

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;

  const visibleEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return events.filter((event) => {
      const matchesQuery =
        !query ||
        event.txId.toLowerCase().includes(query) ||
        event.accountId.toLowerCase().includes(query) ||
        event.devicePlatform.toLowerCase().includes(query) ||
        event.topSignals.some((signal) => signal.toLowerCase().includes(query));

      const matchesRisk = !highRiskOnly || event.riskScore >= 70;
      return matchesQuery && matchesRisk;
    });
  }, [events, highRiskOnly, searchQuery]);

  const approvedCount = events.filter((event) => event.decision === "APPROVE").length;
  const riskedCount = events.filter((event) => event.decision === "RISKED").length;
  const freezeCount = events.filter((event) => event.decision === "FREEZE").length;
  const avgRisk =
    events.length > 0
      ? Math.round(
          events.reduce((sum, event) => sum + event.riskScore, 0) / events.length
        )
      : 0;

  const topAccounts = useMemo<AccountRollup[]>(() => {
    const rollups = new Map<string, AccountRollup>();
    for (const event of events) {
      const existing = rollups.get(event.accountId) ?? {
        accountId: event.accountId,
        events: 0,
        blocked: 0,
        risked: 0,
        avgRisk: 0,
        totalAmount: 0,
      };
      existing.events += 1;
      existing.blocked += event.decision === "FREEZE" ? 1 : 0;
      existing.risked += event.decision === "RISKED" ? 1 : 0;
      existing.totalAmount += event.amount;
      existing.avgRisk += event.riskScore;
      rollups.set(event.accountId, existing);
    }

    return Array.from(rollups.values())
      .map((rollup) => ({
        ...rollup,
        avgRisk: rollup.events ? Math.round(rollup.avgRisk / rollup.events) : 0,
      }))
      .sort(
        (left, right) =>
          right.blocked - left.blocked ||
          right.avgRisk - left.avgRisk ||
          right.totalAmount - left.totalAmount
      )
      .slice(0, 6);
  }, [events]);

  const signalSummary = useMemo<SignalRollup[]>(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const signals =
        event.topSignals.length > 0 ? event.topSignals : ["NO_SIGNALS"];
      for (const signal of signals) {
        counts.set(signal, (counts.get(signal) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
  }, [events]);

  const deviceSummary = useMemo<DeviceRollup[]>(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.devicePlatform, (counts.get(event.devicePlatform) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
  }, [events]);

  const selectedAccountEvents = useMemo(() => {
    if (!selectedEvent) return [];
    return events
      .filter((event) => event.accountId === selectedEvent.accountId)
      .slice(0, 6);
  }, [events, selectedEvent]);

  const handleAction = (
    action: "approve" | "flag" | "stepup" | "freeze",
    txId: string
  ) => {
    setActionLog((prev) => [
      { txId, action, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 7),
    ]);
    setEvents((prev) => prev.filter((event) => event.txId !== txId));
    if (drawerEvent?.txId === txId) {
      setDrawerEvent(null);
    }
  };

  const totalEvents = Math.max(events.length, 1);

  return (
    <div className="min-h-full flex flex-col" style={{ background: "#0b0e14" }}>
      <header
        className="flex-shrink-0 flex flex-col gap-4 border-b px-4 py-4 xl:flex-row xl:items-center xl:justify-between xl:px-6 xl:py-3"
        style={{ borderColor: "rgba(6,182,212,0.12)" }}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Brain className="w-4 h-4 text-cyan-400" />
          <span className="text-white text-sm" style={{ fontWeight: 600 }}>
            Guardian AI Ops
          </span>
          <span className="text-slate-500 text-xs">— Command Center</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div className="text-center">
            <p className="font-mono text-sm text-cyan-400" style={{ fontWeight: 700 }}>
              {events.length.toLocaleString()}
            </p>
            <p className="text-slate-500 text-xs">Processed</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-sm text-red-400" style={{ fontWeight: 700 }}>
              {freezeCount.toLocaleString()}
            </p>
            <p className="text-slate-500 text-xs">Blocked</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-sm text-green-400" style={{ fontWeight: 700 }}>
              {approvedCount.toLocaleString()}
            </p>
            <p className="text-slate-500 text-xs">Approved</p>
          </div>
          <button
            onClick={() => setIsLive((current) => !current)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs transition-all ${
              isLive
                ? "bg-green-500/10 border-green-500/40 text-green-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
            style={{ fontWeight: 700 }}
          >
            <div
              className={`h-2 w-2 rounded-full ${
                isLive ? "bg-green-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            {isLive ? "● LIVE" : "⏸ PAUSED"}
            <span className="font-mono text-xs text-slate-500" style={{ fontWeight: 400 }}>
              DynamoDB
            </span>
          </button>
        </div>
      </header>

      <div className="flex-1 grid min-h-0 grid-cols-1 overflow-y-auto xl:grid-cols-12 xl:overflow-hidden">
        <div
          className="flex min-h-[24rem] flex-col overflow-hidden border-b xl:col-span-5 xl:min-h-0 xl:border-b-0 xl:border-r"
          style={{ borderColor: "rgba(6,182,212,0.08)" }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "rgba(6,182,212,0.08)" }}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-white text-xs" style={{ fontWeight: 600 }}>
                Live Event Stream
              </span>
            </div>
            <div className="flex gap-2 text-xs font-mono">
              <span className="text-green-400">{approvedCount}✓</span>
              <span className="text-orange-400">{riskedCount}⚑</span>
              <span className="text-red-400">{freezeCount}✕</span>
            </div>
          </div>

          <div
            className="flex-shrink-0 space-y-2 border-b px-3 py-3"
            style={{
              borderColor: "rgba(6,182,212,0.08)",
              background: "rgba(6,182,212,0.02)",
            }}
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search event, account, signal..."
                className="w-full rounded-lg py-2 pl-8 pr-3 text-xs font-mono text-slate-300 placeholder-slate-600 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(6,182,212,0.12)",
                }}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                onClick={() => setHighRiskOnly((current) => !current)}
                className={`flex flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                  highRiskOnly
                    ? "bg-red-500/15 border-red-500/40 text-red-300"
                    : "bg-transparent border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                {highRiskOnly ? (
                  <ToggleRight className="h-3.5 w-3.5" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5" />
                )}
                <span style={{ fontWeight: highRiskOnly ? 600 : 400 }}>
                  High Risk Only
                </span>
              </button>
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <MousePointerClick className="h-3 w-3" />
                <span>Click to inspect</span>
              </div>
            </div>

            <div className="h-1 overflow-hidden rounded-full flex">
              <div
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${(approvedCount / totalEvents) * 100}%` }}
              />
              <div
                className="bg-orange-500 transition-all duration-500"
                style={{ width: `${(riskedCount / totalEvents) * 100}%` }}
              />
              <div
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${(freezeCount / totalEvents) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {apiError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                {apiError}
              </div>
            )}
            {visibleEvents.length === 0 && !apiError && (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-xs text-slate-600">
                <Search className="h-6 w-6 opacity-40" />
                <p>No live events match the current filters</p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {visibleEvents.map((event) => {
                const tone = decisionTone(event.decision);
                const isSelected = selectedEvent?.id === event.id;

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.22 }}
                    onClick={() => setSelectedEventId(event.id)}
                    className="cursor-pointer rounded-lg border p-3 transition-all group"
                    style={{
                      background: isSelected ? "rgba(6,182,212,0.08)" : tone.bg,
                      borderColor: isSelected ? "rgba(6,182,212,0.5)" : tone.border,
                      boxShadow: isSelected ? "0 0 16px rgba(6,182,212,0.15)" : "none",
                    }}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-400">
                        {formatEventTime(event.isoTimestamp)}
                      </span>
                      <DecisionBadge decision={event.decision} />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-200 transition-colors group-hover:text-cyan-300">
                        {event.txId}
                      </span>
                      <span className={`text-xs font-mono ${tone.text}`} style={{ fontWeight: 700 }}>
                        Risk {event.riskScore}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-500">
                        {formatUsd(event.amount)} · {event.accountId}
                      </span>
                      <span className="text-xs font-mono text-slate-600">
                        {event.captureMode}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-500">
                        {event.devicePlatform}
                      </span>
                      <span className="text-xs font-mono text-slate-600">
                        {event.motionStatus}/{event.motionSampleCount}
                      </span>
                    </div>

                    <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${event.riskScore}%`,
                          background:
                            event.riskScore > 80
                              ? "#ef4444"
                              : event.riskScore > 55
                                ? "#f97316"
                                : "#22c55e",
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex min-h-[28rem] flex-col overflow-hidden xl:col-span-7 xl:min-h-0">
          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: "rgba(6,182,212,0.08)" }}
          >
            <Network className="w-4 h-4 text-cyan-400" />
            <span className="text-white text-xs" style={{ fontWeight: 600 }}>
              Live Decision Analysis
            </span>
            <span className="ml-auto text-slate-500 text-xs">Derived from /events</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!selectedEvent ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No event selected.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <div
                    className="rounded-xl border p-3"
                    style={{ background: "rgba(6,182,212,0.03)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <p className="text-slate-500 text-xs">Decision</p>
                    <div className="mt-2">
                      <DecisionBadge decision={selectedEvent.decision} />
                    </div>
                  </div>
                  <div
                    className="rounded-xl border p-3"
                    style={{ background: "rgba(6,182,212,0.03)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <p className="text-slate-500 text-xs">AI Risk</p>
                    <p className="mt-2 font-mono text-sm text-red-300" style={{ fontWeight: 700 }}>
                      {Math.round(selectedEvent.riskProb * 100)}%
                    </p>
                  </div>
                  <div
                    className="rounded-xl border p-3"
                    style={{ background: "rgba(6,182,212,0.03)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <p className="text-slate-500 text-xs">Account</p>
                    <p className="mt-2 font-mono text-sm text-cyan-300" style={{ fontWeight: 700 }}>
                      {selectedEvent.accountId}
                    </p>
                  </div>
                  <div
                    className="rounded-xl border p-3"
                    style={{ background: "rgba(6,182,212,0.03)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <p className="text-slate-500 text-xs">Amount</p>
                    <p className="mt-2 font-mono text-sm text-white" style={{ fontWeight: 700 }}>
                      {formatUsd(selectedEvent.amount)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div
                    className="rounded-xl border p-4"
                    style={{ background: "rgba(6,182,212,0.02)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                        Selected Event Breakdown
                      </span>
                    </div>
                    <div className="space-y-3">
                      <ProgressBar label="BMS" value={selectedEvent.bms} color="#06b6d4" />
                      <ProgressBar label="GMRS" value={selectedEvent.gmrs} color="#f97316" />
                      <ProgressBar label="GTRS" value={selectedEvent.gtrs} color="#a855f7" />
                      <ProgressBar
                        label="Unified Risk"
                        value={selectedEvent.unifiedRisk}
                        color="#ef4444"
                      />
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-xs text-slate-500">Triggered Signals</p>
                      <div className="flex flex-wrap gap-2">
                        {(selectedEvent.topSignals.length
                          ? selectedEvent.topSignals
                          : ["NO_SIGNALS"]
                        ).map((signal) => (
                          <span
                            key={signal}
                            className={`rounded-full border px-2.5 py-1 text-xs font-mono ${
                              signal === "NO_SIGNALS"
                                ? "border-green-500/20 bg-green-500/10 text-green-300"
                                : "border-orange-500/20 bg-orange-500/10 text-orange-300"
                            }`}
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-xl border p-4"
                    style={{ background: "rgba(6,182,212,0.02)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                        Session Evidence
                      </span>
                      <button
                        onClick={() => setDrawerEvent(selectedEvent)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/20"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open Drawer
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        {
                          label: "Capture Mode",
                          value: selectedEvent.captureMode,
                          icon: <Scan className="h-3 w-3 text-cyan-400" />,
                        },
                        {
                          label: "Device Platform",
                          value: selectedEvent.devicePlatform,
                          icon: <Fingerprint className="h-3 w-3 text-cyan-400" />,
                        },
                        {
                          label: "Motion",
                          value: `${selectedEvent.motionStatus} (${selectedEvent.motionSampleCount})`,
                          icon: <Zap className="h-3 w-3 text-orange-400" />,
                        },
                        {
                          label: "Location",
                          value: selectedEvent.locationLabel,
                          icon: <Globe className="h-3 w-3 text-purple-400" />,
                        },
                        {
                          label: "Fingerprint",
                          value: selectedEvent.deviceHash,
                          icon: <Fingerprint className="h-3 w-3 text-orange-400" />,
                        },
                        {
                          label: "Secure Context",
                          value: `${selectedEvent.secureContext ? "Secure" : "Insecure"} · ${
                            selectedEvent.touchCapable ? "Touch" : "No Touch"
                          }`,
                          icon: <ShieldAlert className="h-3 w-3 text-green-400" />,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg border p-3"
                          style={{
                            background: "rgba(15,20,32,0.8)",
                            borderColor: "rgba(6,182,212,0.08)",
                          }}
                        >
                          <div className="mb-1.5 flex items-center gap-1.5">
                            {item.icon}
                            <span className="text-xs text-slate-500">{item.label}</span>
                          </div>
                          <p
                            className="text-xs font-mono text-white"
                            style={{ fontWeight: 700, wordBreak: "break-word" }}
                          >
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-xl border p-4"
                  style={{ background: "rgba(168,85,247,0.04)", borderColor: "rgba(168,85,247,0.15)" }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-400" />
                    <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                      AI Reasoning
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">
                    {selectedEvent.reason}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div
                    className="rounded-xl border p-4"
                    style={{ background: "rgba(6,182,212,0.02)", borderColor: "rgba(6,182,212,0.1)" }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                        Account Activity
                      </span>
                    </div>
                    <div className="space-y-2">
                      {selectedAccountEvents.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-lg border px-3 py-2"
                          style={{
                            background: "rgba(15,20,32,0.8)",
                            borderColor: "rgba(6,182,212,0.08)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-cyan-300">{event.txId}</span>
                            <span className="text-xs font-mono text-slate-500">
                              {formatEventTime(event.isoTimestamp)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-slate-400">{formatUsd(event.amount)}</span>
                            <DecisionBadge decision={event.decision} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div
                      className="rounded-xl border p-4"
                      style={{ background: "rgba(249,115,22,0.03)", borderColor: "rgba(249,115,22,0.15)" }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-400" />
                        <span className="text-xs text-orange-300" style={{ fontWeight: 600 }}>
                          Signal Totals
                        </span>
                      </div>
                      <div className="space-y-2">
                        {signalSummary.length > 0 ? (
                          signalSummary.map((signal) => (
                            <div key={signal.name} className="flex items-center justify-between text-xs">
                              <span className="font-mono text-slate-300">{signal.name}</span>
                              <span className="font-mono text-orange-400" style={{ fontWeight: 700 }}>
                                {signal.count}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500">No signals recorded yet.</p>
                        )}
                      </div>
                    </div>

                    <div
                      className="rounded-xl border p-4"
                      style={{ background: "rgba(6,182,212,0.03)", borderColor: "rgba(6,182,212,0.1)" }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <Network className="h-4 w-4 text-cyan-400" />
                        <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                          Account Pressure
                        </span>
                      </div>
                      <div className="space-y-2">
                        {topAccounts.map((account) => (
                          <div
                            key={account.accountId}
                            className="rounded-lg border px-3 py-2"
                            style={{
                              background: "rgba(15,20,32,0.8)",
                              borderColor: "rgba(6,182,212,0.08)",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono text-cyan-300">
                                {account.accountId}
                              </span>
                              <span className="text-xs font-mono text-red-300" style={{ fontWeight: 700 }}>
                                Avg {account.avgRisk}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                              <span>
                                {account.events} events · {account.blocked} blocked · {account.risked} risked
                              </span>
                              <span>{formatUsd(account.totalAmount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
                      style={{ background: "rgba(6,182,212,0.03)", borderColor: "rgba(6,182,212,0.1)" }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
                        <Globe className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-white" style={{ fontWeight: 600 }}>
                          Platform Activity
                        </p>
                        <p className="text-xs text-slate-500">
                          {deviceSummary
                            .map((device) => `${device.platform}: ${device.count}`)
                            .join(" · ") || "No platform data"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${
                            isLive ? "bg-cyan-400 animate-pulse" : "bg-slate-500"
                          }`}
                        />
                        <span className="text-xs text-cyan-400">{isLive ? "Active" : "Paused"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {actionLog.length > 0 && (
                  <div
                    className="rounded-xl border p-4"
                    style={{ background: "rgba(15,20,32,0.8)", borderColor: "rgba(6,182,212,0.08)" }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                        Recent Ops Actions
                      </span>
                    </div>
                    <div className="space-y-1">
                      {actionLog.map((log, index) => (
                        <div
                          key={`${log.txId}-${index}`}
                          className="flex items-center gap-2 text-xs font-mono"
                        >
                          <span className="text-slate-500">{log.time}</span>
                          <span className="truncate text-slate-300">{log.txId}</span>
                          <span className="ml-auto text-cyan-300">{log.action.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <TransactionDrawer
        event={drawerEvent}
        onClose={() => setDrawerEvent(null)}
        onAction={handleAction}
      />
    </div>
  );
}
