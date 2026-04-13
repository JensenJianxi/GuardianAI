import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle,
  Clock,
  Eye,
  Fingerprint,
  Globe,
  Lock,
  Monitor,
  Network,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  API_BASE,
  ApiDecision,
  formatUsd,
  normalizeApiDecision,
  parseApiPayload,
  updateEventReviewDecision,
} from "../guardianApi";

type ApiReviewEvent = {
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
  backend_decision?: ApiDecision | string;
  review_decision?: ApiDecision | string;
  review_source?: string;
  review_updated_at?: string;
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

type AccountProfile = {
  accountId: string;
  totalEvents: number;
  events24h: number;
  approved: number;
  risked: number;
  frozen: number;
  avgRisk: number;
  avgConfidence: number;
  avgBehavioralRisk: number;
  avgNetworkRisk: number;
  avgTransactionalRisk: number;
  totalAmount: number;
  topSignals: string[];
  recentEvents: ApiReviewEvent[];
};

type ReviewCase = {
  id: string;
  backendDecision: ApiDecision;
  recommendedDecision: ApiDecision;
  reviewDecision: ApiDecision;
  analystDecision: ApiDecision | null;
  riskScore: number;
  mulePressure: number;
  decisionConfidence: number;
  amount: number;
  timestamp: string;
  accountId: string;
  reason: string;
  behavioralRisk: number;
  networkRisk: number;
  transactionalRisk: number;
  captureMode: string;
  devicePlatform: string;
  deviceFingerprint: string;
  motionStatus: string;
  motionSampleCount: number;
  secureContext: boolean;
  touchCapable: boolean;
  locationLabel: string;
  topSignals: string[];
  profile: AccountProfile;
};

type ActionLogEntry = {
  caseId: string;
  action: ApiDecision;
  time: string;
};

type ChartTooltipEntry = {
  color: string;
  dataKey: string;
  value: number;
  name?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function safeTimestamp(iso: string) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundToOne(value: number) {
  return Number(value.toFixed(1));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toRiskScore(event: ApiReviewEvent) {
  const explicit = Number(event.risk_prob ?? event.unified_risk);
  if (Number.isFinite(explicit)) {
    return Math.round(clamp01(explicit) * 100);
  }

  const weighted =
    (1 - clamp01(Number(event.bms ?? 0.5))) * 40 +
    clamp01(Number(event.gmrs ?? 0.05)) * 35 +
    clamp01(Number(event.gtrs ?? 0.05)) * 25;

  return Math.round(weighted);
}

function toDecisionConfidence(event: ApiReviewEvent) {
  const risk = Number(event.risk_prob ?? event.unified_risk);
  const normalizedRisk = Number.isFinite(risk)
    ? clamp01(risk)
    : toRiskScore(event) / 100;

  return event.decision === "APPROVE"
    ? (1 - normalizedRisk) * 100
    : normalizedRisk * 100;
}

function toBehavioralRisk(event: ApiReviewEvent) {
  return roundToOne((1 - clamp01(Number(event.bms ?? 0))) * 100);
}

function toNetworkRisk(event: ApiReviewEvent) {
  return roundToOne(clamp01(Number(event.gmrs ?? 0)) * 100);
}

function toTransactionalRisk(event: ApiReviewEvent) {
  return roundToOne(clamp01(Number(event.gtrs ?? 0)) * 100);
}

function formatEventTime(iso: string) {
  const timestamp = safeTimestamp(iso);
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventDate(iso: string) {
  const timestamp = safeTimestamp(iso);
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildLocationLabel(event: ApiReviewEvent) {
  if (event.geo?.lat != null && event.geo?.lng != null) {
    return `${Number(event.geo.lat).toFixed(4)}, ${Number(event.geo.lng).toFixed(4)}`;
  }
  if (event.geo_distance_km != null) {
    return `${Number(event.geo_distance_km).toFixed(1)} km from reference`;
  }
  return "Unavailable";
}

function buildAccountProfiles(events: ApiReviewEvent[]) {
  const now = Date.now();
  const profiles = new Map<
    string,
    AccountProfile & {
      riskAccumulator: number;
      confidenceAccumulator: number;
      behavioralAccumulator: number;
      networkAccumulator: number;
      transactionalAccumulator: number;
      signalCounts: Map<string, number>;
    }
  >();

  for (const event of events) {
    const accountId = event.user_id || "UNKNOWN";
    const current = profiles.get(accountId) ?? {
      accountId,
      totalEvents: 0,
      events24h: 0,
      approved: 0,
      risked: 0,
      frozen: 0,
      avgRisk: 0,
      avgConfidence: 0,
      avgBehavioralRisk: 0,
      avgNetworkRisk: 0,
      avgTransactionalRisk: 0,
      totalAmount: 0,
      topSignals: [],
      recentEvents: [],
      riskAccumulator: 0,
      confidenceAccumulator: 0,
      behavioralAccumulator: 0,
      networkAccumulator: 0,
      transactionalAccumulator: 0,
      signalCounts: new Map<string, number>(),
    };

    current.totalEvents += 1;
    current.events24h += now - safeTimestamp(event.timestamp) <= ONE_DAY_MS ? 1 : 0;
    current.approved += event.decision === "APPROVE" ? 1 : 0;
    current.risked += event.decision === "RISKED" ? 1 : 0;
    current.frozen += event.decision === "FREEZE" ? 1 : 0;
    current.totalAmount += Number(event.amount ?? 0);
    current.riskAccumulator += toRiskScore(event);
    current.confidenceAccumulator += toDecisionConfidence(event);
    current.behavioralAccumulator += toBehavioralRisk(event);
    current.networkAccumulator += toNetworkRisk(event);
    current.transactionalAccumulator += toTransactionalRisk(event);
    current.recentEvents.push(event);

    const signals =
      Array.isArray(event.top_signals) && event.top_signals.length > 0
        ? event.top_signals
        : ["NO_SIGNALS"];
    for (const signal of signals) {
      current.signalCounts.set(signal, (current.signalCounts.get(signal) ?? 0) + 1);
    }

    profiles.set(accountId, current);
  }

  return new Map<string, AccountProfile>(
    Array.from(profiles.entries()).map(([accountId, profile]) => {
      profile.recentEvents.sort(
        (left, right) => safeTimestamp(right.timestamp) - safeTimestamp(left.timestamp)
      );

      const topSignals = Array.from(profile.signalCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([signal]) => signal);

      return [
        accountId,
        {
          accountId,
          totalEvents: profile.totalEvents,
          events24h: profile.events24h,
          approved: profile.approved,
          risked: profile.risked,
          frozen: profile.frozen,
          avgRisk: roundToOne(profile.riskAccumulator / profile.totalEvents),
          avgConfidence: roundToOne(
            profile.confidenceAccumulator / profile.totalEvents
          ),
          avgBehavioralRisk: roundToOne(
            profile.behavioralAccumulator / profile.totalEvents
          ),
          avgNetworkRisk: roundToOne(profile.networkAccumulator / profile.totalEvents),
          avgTransactionalRisk: roundToOne(
            profile.transactionalAccumulator / profile.totalEvents
          ),
          totalAmount: profile.totalAmount,
          topSignals,
          recentEvents: profile.recentEvents.slice(0, 8),
        },
      ];
    })
  );
}

function computeMulePressure(profile: AccountProfile) {
  const repetitionScore = Math.max(0, profile.totalEvents - 1) * 22;
  const velocityScore = Math.max(0, profile.events24h - 1) * 18;
  const enforcementScore = profile.frozen * 16 + profile.risked * 9;
  const graphScore = profile.avgNetworkRisk * 0.28;
  const transactionScore = profile.avgTransactionalRisk * 0.18;

  return Math.min(
    100,
    roundToOne(
      repetitionScore +
        velocityScore +
        enforcementScore +
        graphScore +
        transactionScore
    )
  );
}

function deriveReviewDecision(event: ApiReviewEvent, profile: AccountProfile) {
  const mulePressure = computeMulePressure(profile);
  if (event.decision === "FREEZE") return "FREEZE" as const;
  if (
    mulePressure >= 80 ||
    profile.events24h >= 4 ||
    (profile.totalEvents >= 4 && profile.avgRisk >= 70)
  ) {
    return "FREEZE" as const;
  }
  if (
    event.decision === "RISKED" ||
    mulePressure >= 45 ||
    profile.totalEvents >= 2
  ) {
    return "RISKED" as const;
  }
  return "APPROVE" as const;
}

function buildReviewCases(events: ApiReviewEvent[]) {
  const profiles = buildAccountProfiles(events);
  const reviewCases = events
    .map<ReviewCase>((event) => {
      const profile =
        profiles.get(event.user_id || "UNKNOWN") ??
        ({
          accountId: event.user_id || "UNKNOWN",
          totalEvents: 1,
          events24h: 1,
          approved: event.decision === "APPROVE" ? 1 : 0,
          risked: event.decision === "RISKED" ? 1 : 0,
          frozen: event.decision === "FREEZE" ? 1 : 0,
          avgRisk: toRiskScore(event),
          avgConfidence: roundToOne(toDecisionConfidence(event)),
          avgBehavioralRisk: toBehavioralRisk(event),
          avgNetworkRisk: toNetworkRisk(event),
          avgTransactionalRisk: toTransactionalRisk(event),
          totalAmount: Number(event.amount ?? 0),
          topSignals:
            Array.isArray(event.top_signals) && event.top_signals.length > 0
              ? event.top_signals
              : ["NO_SIGNALS"],
          recentEvents: [event],
        } satisfies AccountProfile);

      const mulePressure = computeMulePressure(profile);
      const backendDecision = normalizeApiDecision(
        event.backend_decision ?? event.decision
      );
      const recommendedDecision = deriveReviewDecision(
        { ...event, decision: backendDecision },
        profile
      );
      const analystDecision =
        event.review_decision != null
          ? normalizeApiDecision(event.review_decision)
          : null;
      const reviewDecision = analystDecision ?? recommendedDecision;
      const topSignals =
        Array.isArray(event.top_signals) && event.top_signals.length > 0
          ? event.top_signals
          : profile.topSignals;

      return {
        id: event.event_id,
        backendDecision,
        recommendedDecision,
        reviewDecision,
        analystDecision,
        riskScore: toRiskScore(event),
        mulePressure,
        decisionConfidence: roundToOne(toDecisionConfidence(event)),
        amount: Number(event.amount ?? 0),
        timestamp: event.timestamp,
        accountId: event.user_id || "UNKNOWN",
        reason: event.reason || "No reasoning returned by the backend.",
        behavioralRisk: toBehavioralRisk(event),
        networkRisk: toNetworkRisk(event),
        transactionalRisk: toTransactionalRisk(event),
        captureMode: String(event.capture_mode || "unknown"),
        devicePlatform: String(event.device_platform || "unknown"),
        deviceFingerprint: String(event.device_fingerprint || "Unavailable"),
        motionStatus: String(event.motion_capture_status || "unknown"),
        motionSampleCount: Number(event.motion_sample_count ?? 0),
        secureContext: Boolean(event.secure_context),
        touchCapable: Boolean(event.touch_capable),
        locationLabel: buildLocationLabel(event),
        topSignals,
        profile,
      };
    })
    .filter(
      (reviewCase) =>
        reviewCase.backendDecision !== "APPROVE" ||
        reviewCase.mulePressure >= 45 ||
        reviewCase.profile.totalEvents >= 2
    )
    .sort((left, right) => {
      const rightPriority = Math.max(right.riskScore, right.mulePressure);
      const leftPriority = Math.max(left.riskScore, left.mulePressure);
      return rightPriority - leftPriority || safeTimestamp(right.timestamp) - safeTimestamp(left.timestamp);
    });

  return { reviewCases, profiles };
}

function queueTone(decision: ApiDecision) {
  if (decision === "FREEZE") {
    return "bg-red-500/15 border-red-500/30 text-red-400";
  }
  if (decision === "RISKED") {
    return "bg-orange-500/15 border-orange-500/30 text-orange-400";
  }
  return "bg-green-500/15 border-green-500/30 text-green-400";
}

function DecisionBadge({
  decision,
  label,
}: {
  decision: ApiDecision;
  label?: string;
}) {
  const normalized = normalizeApiDecision(decision);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-mono ${queueTone(
        normalized
      )}`}
      style={{ fontWeight: 700 }}
    >
      {normalized === "FREEZE" ? (
        <XCircle className="h-3 w-3" />
      ) : normalized === "RISKED" ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <CheckCircle className="h-3 w-3" />
      )}
      {label || normalized}
    </span>
  );
}

function describeReviewEscalation(reviewCase: ReviewCase) {
  if (reviewCase.backendDecision === reviewCase.recommendedDecision) {
    return null;
  }

  if (
    reviewCase.recommendedDecision === "FREEZE" &&
    reviewCase.profile.events24h >= 4
  ) {
    return `Review escalated this case because the same 12-digit target account appeared ${reviewCase.profile.events24h} times in the last 24 hours.`;
  }

  if (
    reviewCase.recommendedDecision === "FREEZE" &&
    reviewCase.mulePressure >= 80
  ) {
    return `Review escalated this case because mule pressure reached ${reviewCase.mulePressure.toFixed(
      0
    )}, which crossed the freeze threshold.`;
  }

  if (
    reviewCase.recommendedDecision === "RISKED" &&
    reviewCase.profile.totalEvents >= 2
  ) {
    return `Review escalated this case because the same 12-digit target account appeared ${reviewCase.profile.totalEvents} times in the live feed.`;
  }

  if (
    reviewCase.recommendedDecision === "RISKED" &&
    reviewCase.mulePressure >= 45
  ) {
    return `Review escalated this case because mule pressure reached ${reviewCase.mulePressure.toFixed(
      0
    )}, which crossed the step-up review threshold.`;
  }

  return "Review rules escalated this case after comparing backend decision, repeat-transfer history, and mule pressure.";
}

function MetricRow({
  label,
  value,
  tone = "text-cyan-300",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${tone}`} style={{ fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{
        background: "rgba(15,20,32,0.95)",
        borderColor: "rgba(6,182,212,0.2)",
        color: "#e2e8f0",
      }}
    >
      {label ? <p className="mb-1 text-slate-400">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color, fontWeight: 600 }}>
          {(entry.name ?? entry.dataKey).toString()}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export function ManualReviewWorkspace() {
  const [events, setEvents] = useState<ApiReviewEvent[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [apiError, setApiError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<ApiDecision | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  async function fetchEvents() {
    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const parsed = await parseApiPayload<ApiReviewEvent[]>(response);
      const normalized = (Array.isArray(parsed) ? parsed : [])
        .map((event) => ({
          ...event,
          decision: normalizeApiDecision(event.decision),
          backend_decision:
            event.backend_decision != null
              ? normalizeApiDecision(event.backend_decision)
              : undefined,
          review_decision:
            event.review_decision != null
              ? normalizeApiDecision(event.review_decision)
              : undefined,
        }))
        .sort((left, right) => safeTimestamp(right.timestamp) - safeTimestamp(left.timestamp));

      setEvents(normalized);
      setApiError("");
    } catch (error) {
      console.error("Failed to fetch manual review cases:", error);
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

  const { reviewCases } = useMemo(() => buildReviewCases(events), [events]);

  useEffect(() => {
    const params = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
    const requestedCase = params?.get("case");

    setSelectedCaseId((current) => {
      if (current && reviewCases.some((reviewCase) => reviewCase.id === current)) {
        return current;
      }
      if (requestedCase && reviewCases.some((reviewCase) => reviewCase.id === requestedCase)) {
        return requestedCase;
      }
      return reviewCases[0]?.id ?? null;
    });
  }, [reviewCases]);

  useEffect(() => {
    setActionError("");
    setActionSuccess("");
  }, [selectedCaseId]);

  const selectedCase =
    reviewCases.find((reviewCase) => reviewCase.id === selectedCaseId) ??
    reviewCases[0] ??
    null;

  const queueStats = useMemo(
    () => ({
      active: reviewCases.length,
      critical: reviewCases.filter(
        (reviewCase) =>
          reviewCase.reviewDecision === "FREEZE" || reviewCase.mulePressure >= 80
      ).length,
      muleWatch: reviewCases.filter(
        (reviewCase) => reviewCase.profile.totalEvents >= 2
      ).length,
    }),
    [reviewCases]
  );

  const selectedMetrics = selectedCase
    ? [
        { metric: "Behavioral", value: selectedCase.behavioralRisk },
        { metric: "Network", value: selectedCase.networkRisk },
        { metric: "Transactional", value: selectedCase.transactionalRisk },
        { metric: "Mule Pressure", value: selectedCase.mulePressure },
      ]
    : [];

  const accountTimeline = selectedCase
    ? [...selectedCase.profile.recentEvents]
        .sort((left, right) => safeTimestamp(left.timestamp) - safeTimestamp(right.timestamp))
        .map((event, index) => ({
          label:
            selectedCase.profile.recentEvents.length > 1
              ? `${index + 1}`
              : formatEventTime(event.timestamp).slice(0, 5),
          risk: toRiskScore(event),
          amount: Number(event.amount ?? 0),
        }))
    : [];

  const handleAction = async (decision: ApiDecision) => {
    if (!selectedCase) return;
    try {
      setPendingDecision(decision);
      setActionError("");
      setActionSuccess("");

      await updateEventReviewDecision({
        eventId: selectedCase.id,
        decision,
        backendDecision: selectedCase.backendDecision,
      });

      const reviewUpdatedAt = new Date().toISOString();
      setEvents((prev) =>
        prev.map((event) =>
          event.event_id === selectedCase.id
            ? {
                ...event,
                decision,
                review_decision: decision,
                backend_decision: event.backend_decision ?? selectedCase.backendDecision,
                review_source: "MANUAL_REVIEW",
                review_updated_at: reviewUpdatedAt,
              }
            : event
        )
      );

      setActionLog((prev) => [
        {
          caseId: selectedCase.id,
          action: decision,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 7),
      ]);
      setActionSuccess(`Saved ${decision} for ${selectedCase.id}.`);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("guardian:data-reset"));
      }
      void fetchEvents();
    } catch (error) {
      console.error("Failed to update manual review status:", error);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingDecision(null);
    }
  };

  return (
    <div className="min-h-full flex flex-col" style={{ background: "#0b0e14" }}>
      <header className="flex-shrink-0 flex flex-col gap-4 border-b border-cyan-500/12 px-4 py-4 xl:flex-row xl:items-center xl:justify-between xl:px-6 xl:py-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Eye className="w-4 h-4 text-cyan-400" />
          <span className="text-white text-sm font-bold">Manual Review Workspace</span>
          <span className="text-slate-500 text-xs">— Live investigation queue derived from /events</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="text-center">
            <p className="text-cyan-400 font-mono text-sm font-bold">
              {queueStats.active}
            </p>
            <p className="text-slate-500 text-xs">Review Cases</p>
          </div>
          <div className="text-center">
            <p className="text-orange-400 font-mono text-sm font-bold">
              {queueStats.muleWatch}
            </p>
            <p className="text-slate-500 text-xs">Mule Watch</p>
          </div>
          <div className="text-center">
            <p className="text-red-400 font-mono text-sm font-bold">
              {queueStats.critical}
            </p>
            <p className="text-slate-500 text-xs">Freeze Review</p>
          </div>
        </div>
      </header>

      <div className="flex-1 grid min-h-0 grid-cols-1 overflow-y-auto xl:grid-cols-12 xl:overflow-hidden">
        <div className="flex min-h-[18rem] flex-col overflow-hidden border-b border-cyan-500/08 xl:col-span-3 xl:border-b-0 xl:border-r">
          <div className="flex-shrink-0 flex items-center gap-2 border-b border-cyan-500/08 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-cyan-400" />
            <span className="text-white text-xs font-bold">Alert Queue</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {apiError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                {apiError}
              </div>
            ) : null}

            {reviewCases.length === 0 && !apiError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-slate-600">
                <Eye className="h-6 w-6 opacity-40" />
                <p>No live cases currently require manual review.</p>
              </div>
            ) : null}

            <AnimatePresence mode="popLayout">
              {reviewCases.map((reviewCase) => {
                const isSelected = selectedCase?.id === reviewCase.id;
                const queueScore = Math.round(
                  Math.max(reviewCase.riskScore, reviewCase.mulePressure)
                );
	                return (
	                  <motion.button
                    key={reviewCase.id}
                    type="button"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    onClick={() => setSelectedCaseId(reviewCase.id)}
                    className="w-full rounded-lg border p-3 text-left transition-all"
                    style={{
                      background: isSelected
                        ? "rgba(6,182,212,0.12)"
                        : "rgba(15,20,32,0.7)",
                      borderColor: isSelected
                        ? "rgba(6,182,212,0.45)"
                        : "rgba(6,182,212,0.14)",
                      boxShadow: isSelected
                        ? "0 0 18px rgba(6,182,212,0.14)"
                        : "none",
                    }}
                  >
	                    <div className="mb-2 flex items-start justify-between gap-2">
	                      <span className="truncate text-cyan-300 text-xs font-mono font-bold">
	                        {reviewCase.id}
	                      </span>
	                      <div className="flex flex-col items-end gap-1">
	                        <DecisionBadge
	                          decision={reviewCase.reviewDecision}
	                          label={`Review ${reviewCase.reviewDecision}`}
	                        />
	                        {reviewCase.backendDecision !== reviewCase.reviewDecision ? (
	                          <DecisionBadge
	                            decision={reviewCase.backendDecision}
	                            label={`AI ${reviewCase.backendDecision}`}
	                          />
	                        ) : null}
	                      </div>
	                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        {formatUsd(reviewCase.amount)}
                      </span>
                      <span className="font-mono text-slate-500">
                        {formatEventTime(reviewCase.timestamp)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-mono">
                        {reviewCase.accountId}
                      </span>
                      <span
                        className={`font-mono ${
                          queueScore >= 85
                            ? "text-red-400"
                            : queueScore >= 60
                              ? "text-orange-400"
                              : "text-cyan-300"
                        }`}
                        style={{ fontWeight: 700 }}
                      >
                        Priority {queueScore}
                      </span>
                    </div>
	                    <div className="mt-2 flex items-center justify-between text-xs">
	                      <span className="text-slate-500">
	                        {reviewCase.profile.totalEvents}x same target account
	                      </span>
	                      <span className="text-orange-400 font-mono" style={{ fontWeight: 700 }}>
	                        Mule {reviewCase.mulePressure.toFixed(0)}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          {actionLog.length > 0 ? (
            <div className="flex-shrink-0 border-t border-cyan-500/08 p-3">
              <p className="mb-2 text-xs font-mono text-slate-500">Recent Review Updates</p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {actionLog.map((entry, index) => (
                  <div
                    key={`${entry.caseId}-${index}`}
                    className="flex items-center gap-2 text-xs font-mono"
                  >
                    <span className="text-slate-500">{entry.time}</span>
                    <span className="truncate text-slate-400">{entry.caseId}</span>
                    <span className="ml-auto text-cyan-300">
                      {entry.action.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-[24rem] flex-col overflow-hidden border-b border-cyan-500/08 xl:col-span-6 xl:border-b-0 xl:border-r">
          {!selectedCase ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-sm text-slate-400">No live case selected.</p>
                <p className="text-xs text-slate-500">
                  Choose a review candidate to inspect live signals.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 border-b border-cyan-500/08 px-4 py-3">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  <span className="text-white text-xs font-bold">
                    Forensic Identity Grid
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: "Account",
                      value: selectedCase.accountId,
                      icon: <User className="w-3 h-3 text-slate-400" />,
                    },
                    {
                      label: "Submitted",
                      value: formatEventDate(selectedCase.timestamp),
                      icon: <Clock className="w-3 h-3 text-slate-400" />,
                    },
                    {
                      label: "Capture Mode",
                      value: selectedCase.captureMode,
                      icon: <Monitor className="w-3 h-3 text-slate-400" />,
                    },
                    {
                      label: "Location",
                      value: selectedCase.locationLabel,
                      icon: <Globe className="w-3 h-3 text-slate-400" />,
                    },
                    {
                      label: "Device",
                      value: selectedCase.devicePlatform,
                      icon: <Fingerprint className="w-3 h-3 text-slate-400" />,
                    },
                    {
                      label: "Device Hash",
                      value: selectedCase.deviceFingerprint,
                      icon: <Lock className="w-3 h-3 text-slate-400" />,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        {item.icon}
                        <span className="text-xs text-slate-500">{item.label}</span>
                      </div>
                      <p className="break-words text-xs font-mono text-cyan-300">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-300">
                        Live Score Breakdown
                      </span>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={selectedMetrics}
                          margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                        >
                          <CartesianGrid stroke="rgba(6,182,212,0.08)" vertical={false} />
                          <XAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="value" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Network className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-300">
                        Repeat-Transfer Timeline
                      </span>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={accountTimeline}
                          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                        >
                          <CartesianGrid stroke="rgba(6,182,212,0.08)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Line
                            type="monotone"
                            dataKey="risk"
                            name="Risk"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={{ fill: "#f97316", r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Network className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white">
                      Mule Pattern Analysis
                    </span>
                    <span className="text-xs text-slate-500">
                      repeated transfers to the same 12-digit target account
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-orange-500/15 bg-orange-500/5 p-3">
                      <p className="text-xs text-slate-500">Transfers to account</p>
                      <p className="mt-2 font-mono text-lg text-orange-300" style={{ fontWeight: 700 }}>
                        {selectedCase.profile.totalEvents}
                      </p>
                    </div>
                    <div className="rounded-lg border border-orange-500/15 bg-orange-500/5 p-3">
                      <p className="text-xs text-slate-500">Last 24h</p>
                      <p className="mt-2 font-mono text-lg text-orange-300" style={{ fontWeight: 700 }}>
                        {selectedCase.profile.events24h}
                      </p>
                    </div>
                    <div className="rounded-lg border border-red-500/15 bg-red-500/5 p-3">
                      <p className="text-xs text-slate-500">Mule pressure</p>
                      <p className="mt-2 font-mono text-lg text-red-300" style={{ fontWeight: 700 }}>
                        {selectedCase.mulePressure.toFixed(0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3">
                      <p className="text-xs text-slate-500">Recommended action</p>
                      <div className="mt-2 space-y-2">
                        <DecisionBadge
                          decision={selectedCase.recommendedDecision}
                          label={`Recommended ${selectedCase.recommendedDecision}`}
                        />
                        {selectedCase.reviewDecision !== selectedCase.recommendedDecision ? (
                          <DecisionBadge
                            decision={selectedCase.reviewDecision}
                            label={`Saved ${selectedCase.reviewDecision}`}
                          />
                        ) : null}
                        {selectedCase.backendDecision !== selectedCase.recommendedDecision ? (
                          <DecisionBadge
                            decision={selectedCase.backendDecision}
                            label={`AI ${selectedCase.backendDecision}`}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-cyan-500/10 bg-[#0b0e14] p-3">
                      <p className="mb-2 text-xs font-bold text-cyan-300">
                        Why this case is in review
                      </p>
                      <ul className="space-y-2 text-xs text-slate-300">
                        <li>
                          Same target account has appeared{" "}
                          <span className="font-mono text-cyan-300">
                            {selectedCase.profile.totalEvents} times
                          </span>{" "}
                          across the live event feed.
                        </li>
                        <li>
                          Recent velocity is{" "}
                          <span className="font-mono text-cyan-300">
                            {selectedCase.profile.events24h} transfers / 24h
                          </span>
                          , which is treated as mule pressure in the admin layer.
                        </li>
                        <li>
                          Network risk averages{" "}
                          <span className="font-mono text-orange-300">
                            {selectedCase.profile.avgNetworkRisk.toFixed(1)}
                          </span>
                          , with transaction risk averaging{" "}
                          <span className="font-mono text-orange-300">
                            {selectedCase.profile.avgTransactionalRisk.toFixed(1)}
                          </span>
                          .
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-cyan-500/10 bg-[#0b0e14] p-3">
                      <p className="mb-2 text-xs font-bold text-cyan-300">
                        Same-account activity
                      </p>
                      <div className="space-y-2">
                        {selectedCase.profile.recentEvents.map((event) => (
                          <div
                            key={event.event_id}
                            className="rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono text-cyan-300">
                                {event.event_id}
                              </span>
                              <span className="text-xs font-mono text-slate-500">
                                {formatEventTime(event.timestamp)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-xs text-slate-400">
                                {formatUsd(Number(event.amount ?? 0))}
                              </span>
                              <DecisionBadge decision={normalizeApiDecision(event.decision)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex min-h-[20rem] flex-col overflow-hidden xl:col-span-3">
          <div className="flex-shrink-0 flex items-center gap-2 border-b border-cyan-500/08 px-4 py-3">
            <Brain className="w-4 h-4 text-cyan-400" />
            <span className="text-white text-xs font-bold">AI Logic</span>
          </div>

          {!selectedCase ? (
            <div className="flex flex-1 items-center justify-center p-4 text-center">
              <div>
                <Brain className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-sm text-slate-400">No analysis available</p>
                <p className="text-xs text-slate-500">
                  Select a live case to inspect reasoning.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/20">
                    <Brain className="h-3 w-3 text-purple-400" />
                  </div>
                  <span className="text-xs font-bold text-purple-300">
                    Backend Reasoning
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">
                  {selectedCase.reason}
                </p>
              </div>

	              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
	                <p className="mb-3 text-xs font-bold text-cyan-300">
	                  Decision Alignment
                </p>
                <div className="space-y-2">
                  <MetricRow
                    label="Backend AI decision"
                    value={selectedCase.backendDecision}
                    tone="text-cyan-300"
                  />
                  <MetricRow
                    label="Review recommendation"
                    value={selectedCase.recommendedDecision}
                    tone={
                      selectedCase.recommendedDecision === "FREEZE"
                        ? "text-red-300"
                        : selectedCase.recommendedDecision === "RISKED"
                          ? "text-orange-300"
                          : "text-green-300"
                    }
                  />
                  <MetricRow
                    label="Current saved status"
                    value={selectedCase.reviewDecision}
                    tone={
                      selectedCase.reviewDecision === "FREEZE"
                        ? "text-red-300"
                        : selectedCase.reviewDecision === "RISKED"
                          ? "text-orange-300"
                          : "text-green-300"
                    }
                  />
                  <MetricRow
                    label="Decision confidence"
                    value={`${selectedCase.decisionConfidence.toFixed(1)}%`}
                    tone="text-cyan-300"
                  />
	                  <MetricRow
	                    label="Same-account average risk"
	                    value={`${selectedCase.profile.avgRisk.toFixed(1)}`}
	                    tone="text-orange-300"
	                  />
	                </div>
		                {describeReviewEscalation(selectedCase) ? (
		                  <div className="mt-3 rounded-lg border border-orange-500/15 bg-orange-500/5 p-3">
		                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-300">
		                      Why Review Differs From AI
		                    </p>
		                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
		                      {describeReviewEscalation(selectedCase)}
		                    </p>
		                  </div>
		                ) : null}
		              </div>

		              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
		                  <div className="mb-3 flex items-center justify-between gap-3">
		                    <div>
		                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
		                        Take Analyst Action
		                      </p>
		                    <p className="mt-1 text-[11px] text-slate-400">
		                      Use these controls to record your review decision for the selected case.
		                    </p>
		                  </div>
		                  <DecisionBadge
		                    decision={selectedCase.recommendedDecision}
		                    label={`Recommended ${selectedCase.recommendedDecision}`}
		                  />
		                </div>
		                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
		                  <button
		                    type="button"
		                    disabled={pendingDecision !== null}
		                    onClick={() => void handleAction("APPROVE")}
		                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-300 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-60"
		                  >
		                    <CheckCircle className="h-3.5 w-3.5" />
		                    {pendingDecision === "APPROVE" ? "Saving..." : "Approve"}
		                  </button>
		                  <button
		                    type="button"
		                    disabled={pendingDecision !== null}
		                    onClick={() => void handleAction("RISKED")}
		                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
		                  >
		                    <AlertTriangle className="h-3.5 w-3.5" />
		                    {pendingDecision === "RISKED" ? "Saving..." : "Risked"}
		                  </button>
		                  <button
		                    type="button"
		                    disabled={pendingDecision !== null}
		                    onClick={() => void handleAction("FREEZE")}
		                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
		                  >
		                    <XCircle className="h-3.5 w-3.5" />
		                    {pendingDecision === "FREEZE" ? "Saving..." : "Freeze"}
		                  </button>
		                </div>
		                {actionSuccess ? (
		                  <p className="mt-3 text-[11px] text-green-300">{actionSuccess}</p>
		                ) : null}
		                {actionError ? (
		                  <p className="mt-3 text-[11px] text-red-300">{actionError}</p>
		                ) : null}
		                {!actionSuccess && !actionError ? (
		                  <p className="mt-3 text-[11px] text-slate-500">
		                    These controls save the selected review status back to DynamoDB through the
		                    review API.
		                  </p>
		                ) : null}
		              </div>

	              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
	                <p className="mb-3 text-xs font-bold text-cyan-300">Triggered Signals</p>
                <div className="flex flex-wrap gap-2">
                  {(selectedCase.topSignals.length ? selectedCase.topSignals : ["NO_SIGNALS"]).map(
                    (signal) => (
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
                    )
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <p className="mb-3 text-xs font-bold text-cyan-300">Case Metrics</p>
                <div className="space-y-2">
                  <MetricRow
                    label="Motion evidence"
                    value={`${selectedCase.motionStatus} (${selectedCase.motionSampleCount})`}
                  />
                  <MetricRow
                    label="Context"
                    value={`${selectedCase.secureContext ? "Secure" : "Insecure"} · ${
                      selectedCase.touchCapable ? "Touch" : "No Touch"
                    }`}
                  />
                  <MetricRow
                    label="Same-account volume"
                    value={formatUsd(selectedCase.profile.totalAmount)}
                  />
                  <MetricRow
                    label="Account confidence"
                    value={`${selectedCase.profile.avgConfidence.toFixed(1)}%`}
                  />
                </div>
              </div>

	            </div>
          )}
        </div>
      </div>
    </div>
  );
}
