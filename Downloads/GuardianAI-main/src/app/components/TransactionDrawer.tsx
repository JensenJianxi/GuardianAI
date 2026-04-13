import { useEffect, useState } from "react";
import {
  X,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Fingerprint,
  Globe,
  Clock,
  ShieldAlert,
  Brain,
  Activity,
  ChevronRight,
  Lock,
  Scan,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { formatUsd } from "../guardianApi";

export type Decision = "APPROVE" | "RISKED" | "FREEZE";

export interface DrawerEvent {
  id: string;
  timestamp: string;
  isoTimestamp: string;
  txId: string;
  amount: number;
  decision: Decision;
  riskScore: number;
  riskProb: number;
  unifiedRisk: number;
  accountId: string;
  reason: string;
  bms: number;
  gmrs: number;
  gtrs: number;
  topSignals: string[];
  captureMode: string;
  devicePlatform: string;
  touchCapable: boolean;
  secureContext: boolean;
  deviceHash: string;
  motionStatus: string;
  motionSampleCount: number;
  locationLabel: string;
  geoDistanceKm?: number | null;
}

interface TransactionDrawerProps {
  event: DrawerEvent | null;
  onClose: () => void;
  onAction: (action: "approve" | "flag" | "stepup" | "freeze", txId: string) => void;
}

function formatScorePercent(value: number) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return `${pct.toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        background: "rgba(15,20,32,0.8)",
        borderColor: "rgba(6,182,212,0.08)",
      }}
    >
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className={`font-mono text-sm ${tone}`} style={{ fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function ScoreBar({
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
      <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function signalTone(signal: string) {
  if (signal === "NO_SIGNALS") return "text-green-300 border-green-500/20 bg-green-500/10";
  if (signal.includes("LOCATION") || signal.includes("FOREIGN")) return "text-red-300 border-red-500/20 bg-red-500/10";
  if (signal.includes("VELOCITY")) return "text-orange-300 border-orange-500/20 bg-orange-500/10";
  return "text-cyan-300 border-cyan-500/20 bg-cyan-500/10";
}

export function TransactionDrawer({ event, onClose, onAction }: TransactionDrawerProps) {
  const [actionTaken, setActionTaken] = useState<string | null>(null);

  useEffect(() => {
    setActionTaken(null);
  }, [event?.txId]);

  const riskColor =
    !event
      ? "#22c55e"
      : event.riskScore >= 80
        ? "#ef4444"
        : event.riskScore >= 55
          ? "#f97316"
          : "#22c55e";

  const riskLabel =
    !event
      ? "LOW RISK"
      : event.riskScore >= 80
        ? "HIGH RISK"
        : event.riskScore >= 55
          ? "MEDIUM RISK"
          : "LOW RISK";

  const handleAction = (action: "approve" | "flag" | "stepup" | "freeze") => {
    if (!event) return;
    setActionTaken(action);
    onAction(action, event.txId);
    setTimeout(onClose, 1000);
  };

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full flex-col"
            style={{
              width: "440px",
              background: "#000000",
              borderLeft: "1px solid rgba(6,182,212,0.2)",
              boxShadow: "-8px 0 60px rgba(6,182,212,0.12), -2px 0 20px rgba(0,0,0,0.8)",
            }}
          >
            <div
              className="flex-shrink-0 border-b px-5 pb-4 pt-4"
              style={{ borderColor: "rgba(6,182,212,0.15)" }}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">Transaction Evidence</span>
                    <ChevronRight className="h-3 w-3 text-slate-600" />
                    <span className="text-xs font-mono text-slate-400">Live Event Detail</span>
                  </div>
                  <p
                    className="font-mono text-cyan-300"
                    style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.02em" }}
                  >
                    {event.txId}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                  style={{
                    background: `${riskColor}15`,
                    borderColor: `${riskColor}40`,
                    color: riskColor,
                  }}
                >
                  <ShieldAlert className="h-3 w-3" />
                  <span className="font-mono text-xs" style={{ fontWeight: 700 }}>
                    {riskLabel}: {event.riskScore}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">
                  <Clock className="h-3 w-3 text-slate-500" />
                  <span className="font-mono text-xs text-slate-400">{event.timestamp}</span>
                </div>

                <div
                  className="ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                  style={{
                    background:
                      event.decision === "FREEZE"
                        ? "rgba(239,68,68,0.1)"
                        : event.decision === "RISKED"
                          ? "rgba(249,115,22,0.1)"
                          : "rgba(34,197,94,0.1)",
                    borderColor:
                      event.decision === "FREEZE"
                        ? "rgba(239,68,68,0.3)"
                        : event.decision === "RISKED"
                          ? "rgba(249,115,22,0.3)"
                          : "rgba(34,197,94,0.3)",
                    color:
                      event.decision === "FREEZE"
                        ? "#ef4444"
                        : event.decision === "RISKED"
                          ? "#f97316"
                          : "#22c55e",
                  }}
                >
                  {event.decision === "FREEZE" ? (
                    <XCircle className="h-3 w-3" />
                  ) : event.decision === "RISKED" ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <CheckCircle className="h-3 w-3" />
                  )}
                  <span className="font-mono text-xs" style={{ fontWeight: 700 }}>
                    {event.decision}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-slate-700" />
                <span className="font-mono text-xs text-slate-700">
                  Live decision sourced from Lambda + Bedrock
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-5 pb-4 pt-5">
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Amount" value={formatUsd(event.amount)} tone="text-cyan-300" />
                  <StatCard label="AI Risk Probability" value={`${Math.round(event.riskProb * 100)}%`} tone={event.riskScore >= 80 ? "text-red-400" : event.riskScore >= 55 ? "text-orange-400" : "text-green-400"} />
                  <StatCard label="Unified Risk" value={formatScorePercent(event.unifiedRisk)} tone="text-purple-300" />
                  <StatCard label="Account" value={event.accountId} tone="text-white" />
                </div>
              </div>

              <div className="mx-5 h-px" style={{ background: "rgba(6,182,212,0.08)" }} />

              <div className="px-5 pb-4 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-cyan-500/15">
                    <Activity className="h-3 w-3 text-cyan-400" />
                  </div>
                  <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                    Score Stack
                  </span>
                  <span className="ml-auto text-xs font-mono text-slate-600">Actual model outputs</span>
                </div>
                <div
                  className="space-y-3 rounded-xl border p-3"
                  style={{ background: "rgba(6,182,212,0.02)", borderColor: "rgba(6,182,212,0.1)" }}
                >
                  <ScoreBar label="BMS" value={event.bms} color="#06b6d4" />
                  <ScoreBar label="GMRS" value={event.gmrs} color="#f97316" />
                  <ScoreBar label="GTRS" value={event.gtrs} color="#a855f7" />
                </div>
              </div>

              <div className="mx-5 h-px" style={{ background: "rgba(6,182,212,0.08)" }} />

              <div className="px-5 pb-4 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-orange-500/15">
                    <Scan className="h-3 w-3 text-orange-400" />
                  </div>
                  <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                    Triggered Signals
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.topSignals.length > 0 ? (
                    event.topSignals.map((signal) => (
                      <span
                        key={signal}
                        className={`rounded-full border px-2.5 py-1 text-xs font-mono ${signalTone(signal)}`}
                      >
                        {signal}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-mono text-green-300">
                      NO_SIGNALS
                    </span>
                  )}
                </div>
              </div>

              <div className="mx-5 h-px" style={{ background: "rgba(6,182,212,0.08)" }} />

              <div className="px-5 pb-4 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/15">
                    <Fingerprint className="h-3 w-3 text-purple-400" />
                  </div>
                  <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                    Session Evidence
                  </span>
                  <span className="ml-auto text-xs font-mono text-slate-600">Actual backend fields</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Capture Mode" value={event.captureMode || "unknown"} tone="text-cyan-300" />
                  <StatCard label="Device Platform" value={event.devicePlatform || "unknown"} tone="text-white" />
                  <StatCard label="Motion Capture" value={`${event.motionStatus} (${event.motionSampleCount})`} tone={event.motionSampleCount > 0 ? "text-orange-300" : "text-slate-300"} />
                  <StatCard label="Location" value={event.locationLabel} tone="text-purple-300" />
                  <StatCard label="Device Fingerprint" value={event.deviceHash || "Unavailable"} tone="text-orange-300" />
                  <StatCard
                    label="Security Flags"
                    value={`${event.secureContext ? "Secure" : "Insecure"} · ${event.touchCapable ? "Touch" : "No Touch"}`}
                    tone={event.secureContext ? "text-green-300" : "text-red-300"}
                  />
                </div>
                {event.geoDistanceKm != null && (
                  <div
                    className="mt-2 rounded-lg border px-3 py-2"
                    style={{ background: "rgba(15,20,32,0.8)", borderColor: "rgba(6,182,212,0.08)" }}
                  >
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Globe className="h-3 w-3" />
                      Geo distance from reference
                    </div>
                    <p className="mt-1 font-mono text-sm text-cyan-300" style={{ fontWeight: 700 }}>
                      {event.geoDistanceKm.toFixed(2)} km
                    </p>
                  </div>
                )}
              </div>

              <div className="mx-5 h-px" style={{ background: "rgba(168,85,247,0.15)" }} />

              <div className="px-5 pb-6 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/15">
                    <Brain className="h-3 w-3 text-purple-400" />
                  </div>
                  <span className="text-xs text-white" style={{ fontWeight: 600 }}>
                    AI Reasoning
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                    <span className="text-xs font-mono text-purple-400/60">Live decision rationale</span>
                  </div>
                </div>
                <div
                  className="rounded-xl border p-4"
                  style={{
                    background: "rgba(168,85,247,0.04)",
                    borderColor: "rgba(168,85,247,0.15)",
                    boxShadow: "inset 0 0 30px rgba(168,85,247,0.04)",
                  }}
                >
                  <p className="font-mono text-xs leading-relaxed text-slate-300">
                    {event.reason || "No reasoning provided."}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="flex-shrink-0 border-t px-5 py-4"
              style={{
                borderColor: "rgba(6,182,212,0.15)",
                background: "rgba(0,0,0,0.95)",
                backdropFilter: "blur(10px)",
              }}
            >
              {actionTaken ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 py-3"
                >
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-mono text-green-400" style={{ fontWeight: 600 }}>
                    Action "{actionTaken.toUpperCase()}" applied — closing...
                  </span>
                </motion.div>
              ) : (
                <>
                  <p className="mb-3 text-center text-xs font-mono text-slate-600">
                    Ops intervention controls
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleAction("approve")}
                      className="flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: "rgba(34,197,94,0.1)",
                        borderColor: "rgba(34,197,94,0.3)",
                        boxShadow: "0 0 12px rgba(34,197,94,0.1)",
                      }}
                    >
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-xs font-mono text-green-400" style={{ fontWeight: 700 }}>
                        Approve
                      </span>
                    </button>

                    <button
                      onClick={() => handleAction("flag")}
                      className="flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: "rgba(234,179,8,0.1)",
                        borderColor: "rgba(234,179,8,0.3)",
                        boxShadow: "0 0 12px rgba(234,179,8,0.1)",
                      }}
                    >
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      <span className="text-xs font-mono text-yellow-400" style={{ fontWeight: 700 }}>
                        Flag
                      </span>
                    </button>

                    <button
                      onClick={() => handleAction("stepup")}
                      className="flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: "rgba(59,130,246,0.1)",
                        borderColor: "rgba(59,130,246,0.3)",
                        boxShadow: "0 0 12px rgba(59,130,246,0.1)",
                      }}
                    >
                      <Scan className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-mono text-blue-400" style={{ fontWeight: 700 }}>
                        Step-Up
                      </span>
                    </button>

                    <button
                      onClick={() => handleAction("freeze")}
                      className="flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        borderColor: "rgba(239,68,68,0.35)",
                        boxShadow: "0 0 16px rgba(239,68,68,0.15)",
                      }}
                    >
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-xs font-mono text-red-400" style={{ fontWeight: 700 }}>
                        Freeze
                      </span>
                    </button>
                  </div>
                  <p className="mt-2.5 text-center text-xs font-mono text-slate-700">
                    Review actions are local until an override API is connected
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
