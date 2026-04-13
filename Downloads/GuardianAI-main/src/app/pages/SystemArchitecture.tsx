import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Globe,
  Zap,
  Brain,
  Network,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Info,
  Activity,
  Database,
  Cpu,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ArchNode {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
  bg: string;
  border: string;
  desc: string;
  stats?: { label: string; value: string }[];
}

// ─── Node definitions ─────────────────────────────────────────────────────────

const nodes: ArchNode[] = [
  {
    id: "browser",
    label: "Web Browser",
    sublabel: "Customer Interaction",
    icon: <Globe className="w-7 h-7" />,
    color: "#06b6d4",
    glow: "rgba(6,182,212,0.4)",
    bg: "rgba(6,182,212,0.1)",
    border: "rgba(6,182,212,0.3)",
    desc: "Customer interacts with the Guardian Bank portal. Behavioural biometrics (keystroke dynamics, mouse patterns) are captured in real-time alongside transaction data.",
    stats: [
      { label: "Avg latency", value: "< 50ms" },
      { label: "Sessions/min", value: "4,200" },
    ],
  },
  {
    id: "kinesis",
    label: "AWS Kinesis",
    sublabel: "Event Streaming",
    icon: <Zap className="w-7 h-7" />,
    color: "#f97316",
    glow: "rgba(249,115,22,0.4)",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.3)",
    desc: "Amazon Kinesis Data Streams ingests millions of events per second. Each transaction event is enriched with metadata and fanned out to three parallel ML inference heads.",
    stats: [
      { label: "Throughput", value: "1M events/s" },
      { label: "Retention", value: "24 hours" },
    ],
  },
  {
    id: "sagemaker",
    label: "SageMaker",
    sublabel: "Tabular ML — Brain",
    icon: <Brain className="w-7 h-7" />,
    color: "#a855f7",
    glow: "rgba(168,85,247,0.4)",
    bg: "rgba(168,85,247,0.1)",
    border: "rgba(168,85,247,0.3)",
    desc: "Amazon SageMaker hosts an XGBoost + LightGBM ensemble trained on 200M historical transactions. Predicts fraud probability from tabular features (amount, merchant, location, time).",
    stats: [
      { label: "Inference", value: "8ms p99" },
      { label: "Accuracy", value: "96.2%" },
    ],
  },
  {
    id: "neptune",
    label: "Amazon Neptune",
    sublabel: "Graph Neural Network",
    icon: <Network className="w-7 h-7" />,
    color: "#06b6d4",
    glow: "rgba(6,182,212,0.4)",
    bg: "rgba(6,182,212,0.1)",
    border: "rgba(6,182,212,0.3)",
    desc: "Neptune runs GraphSAGE on a live graph of 50M+ account nodes. Identifies mule networks, money laundering rings, and account proximity to known bad actors.",
    stats: [
      { label: "Graph nodes", value: "50M+" },
      { label: "Edges", value: "800M+" },
    ],
  },
  {
    id: "transformer",
    label: "Transformer",
    sublabel: "Sequence Model — Hand",
    icon: <Cpu className="w-7 h-7" />,
    color: "#22c55e",
    glow: "rgba(34,197,94,0.4)",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.3)",
    desc: "A BERT-based transformer encodes the user's session as a sequence of events, detecting structuring (smurfing), velocity anomalies, and behavioural deviation from past sessions.",
    stats: [
      { label: "Context window", value: "512 events" },
      { label: "Latency", value: "12ms p50" },
    ],
  },
  {
    id: "bedrock",
    label: "Amazon Bedrock",
    sublabel: "Late Fusion + Orchestration",
    icon: <Database className="w-7 h-7" />,
    color: "#f97316",
    glow: "rgba(249,115,22,0.5)",
    bg: "rgba(249,115,22,0.08)",
    border: "rgba(249,115,22,0.35)",
    desc: "Amazon Bedrock (Claude 3.5) acts as the late-fusion orchestrator. It receives all three model outputs, fuses them with an attention mechanism, and generates a final decision with a natural language audit trail.",
    stats: [
      { label: "Model", value: "Claude 3.5" },
      { label: "Decision SLA", value: "< 100ms" },
    ],
  },
];

const outputs = [
  {
    id: "approve",
    label: "Approve",
    desc: "Transaction cleared. Standard monitoring continues.",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.3)",
    icon: <CheckCircle className="w-5 h-5" />,
    pct: "87%",
  },
  {
    id: "stepup",
    label: "Step-Up",
    desc: "Adaptive friction triggered. MFA or biometric re-auth required.",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.3)",
    icon: <AlertTriangle className="w-5 h-5" />,
    pct: "10%",
  },
  {
    id: "freeze",
    label: "Freeze",
    desc: "Account frozen. Human review required before funds released.",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
    icon: <XCircle className="w-5 h-5" />,
    pct: "3%",
  },
];

// ─── Animated data flow path ──────────────────────────────────────────────────

function DataFlow({ active }: { active: boolean }) {
  return (
    <motion.div
      className="w-8 flex items-center justify-center flex-shrink-0"
      animate={{ opacity: active ? 1 : 0.3 }}
    >
      <div className="relative w-full">
        <div
          className="h-0.5 w-full"
          style={{ background: "rgba(6,182,212,0.3)" }}
        />
        {active && (
          <motion.div
            className="absolute top-0 left-0 h-0.5 w-3 rounded-full"
            style={{ background: "#06b6d4" }}
            animate={{ left: ["0%", "100%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )}
        <ArrowRight className="absolute -right-2 -top-2 w-4 h-4 text-cyan-500/50" />
      </div>
    </motion.div>
  );
}

function VerticalFlow({ active }: { active: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <div className="relative w-0.5 h-8" style={{ background: "rgba(6,182,212,0.2)" }}>
        {active && (
          <motion.div
            className="absolute top-0 left-0 w-full rounded-full"
            style={{ background: "#06b6d4", height: "12px" }}
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  isSelected,
  onClick,
  size = "md",
}: {
  node: ArchNode;
  isSelected: boolean;
  onClick: () => void;
  size?: "md" | "lg";
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative rounded-2xl border transition-all text-left w-full"
      style={{
        background: isSelected ? node.bg : "rgba(15,20,32,0.8)",
        borderColor: isSelected ? node.border : "rgba(6,182,212,0.08)",
        boxShadow: isSelected ? `0 0 30px ${node.glow}` : "none",
        padding: size === "lg" ? "20px" : "14px",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: node.bg,
            border: `1px solid ${node.border}`,
            color: node.color,
            width: size === "lg" ? "52px" : "40px",
            height: size === "lg" ? "52px" : "40px",
          }}
        >
          {node.icon}
        </div>
        <div>
          <p
            className="text-white text-sm"
            style={{ fontWeight: 600 }}
          >
            {node.label}
          </p>
          <p style={{ color: node.color, fontSize: "11px" }}>
            {node.sublabel}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SystemArchitecture() {
  const [selected, setSelected] = useState<string>("bedrock");
  const [animActive, setAnimActive] = useState(true);

  const selectedNode = [...nodes, ...outputs.map(o => ({
    id: o.id,
    label: o.label,
    sublabel: "Decision Output",
    icon: o.icon,
    color: o.color,
    glow: o.bg,
    bg: o.bg,
    border: o.border,
    desc: o.desc,
    stats: [{ label: "Decision rate", value: o.pct }],
  }))].find((n) => n.id === selected);

  return (
    <div className="min-h-full" style={{ background: "#0b0e14" }}>
      {/* Header */}
      <header
        className="flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        style={{ borderColor: "rgba(6,182,212,0.12)" }}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-white text-sm" style={{ fontWeight: 600 }}>
            System Architecture
          </span>
          <span className="text-slate-500 text-xs">— Technical Pipeline</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAnimActive((a) => !a)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
              animActive
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${animActive ? "bg-cyan-400 animate-pulse" : "bg-slate-500"}`}
            />
            {animActive ? "Data Flow Active" : "Paused"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* ── Pipeline Diagram ── */}
        <div
          className="rounded-2xl border p-6 mb-6"
          style={{
            background: "rgba(6,182,212,0.02)",
            borderColor: "rgba(6,182,212,0.1)",
          }}
        >
          <p className="text-slate-400 text-xs mb-5 text-center">
            Click any component to view details · Data flows left → right
          </p>

          {/* Row 1: Browser → Kinesis */}
          <div className="mb-3 flex flex-col items-stretch justify-center gap-3 md:mb-2 md:flex-row md:items-center md:gap-0">
            <div className="w-full max-w-sm md:w-44">
              <NodeCard
                node={nodes[0]}
                isSelected={selected === nodes[0].id}
                onClick={() => setSelected(nodes[0].id)}
              />
            </div>
            <div className="hidden md:block">
              <DataFlow active={animActive} />
            </div>
            <div className="md:hidden">
              <VerticalFlow active={animActive} />
            </div>
            <div className="w-full max-w-sm md:w-44">
              <NodeCard
                node={nodes[1]}
                isSelected={selected === nodes[1].id}
                onClick={() => setSelected(nodes[1].id)}
              />
            </div>
          </div>

          {/* Fan-out arrows */}
          <div className="mb-0 hidden justify-center gap-32 md:flex">
            <VerticalFlow active={animActive} />
            <VerticalFlow active={animActive} />
            <VerticalFlow active={animActive} />
          </div>
          <div className="md:hidden">
            <VerticalFlow active={animActive} />
          </div>

          {/* Row 2: 3 ML models */}
          <div className="mb-0 grid grid-cols-1 gap-4 md:grid-cols-3">
            {nodes.slice(2, 5).map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={selected === node.id}
                onClick={() => setSelected(node.id)}
              />
            ))}
          </div>

          {/* Converge arrows */}
          <div className="mb-0 hidden justify-center gap-32 md:flex">
            <VerticalFlow active={animActive} />
            <VerticalFlow active={animActive} />
            <VerticalFlow active={animActive} />
          </div>

          {/* Row 3: Bedrock (centered) */}
          <div className="mb-0 flex justify-center">
            <div className="w-full max-w-md md:w-72">
              <NodeCard
                node={nodes[5]}
                isSelected={selected === nodes[5].id}
                onClick={() => setSelected(nodes[5].id)}
                size="lg"
              />
            </div>
          </div>

          {/* Output arrows */}
          <div className="mb-0 hidden justify-center gap-20 md:flex">
            <VerticalFlow active={animActive} />
            <VerticalFlow active={animActive} />
            <VerticalFlow active={animActive} />
          </div>
          <div className="md:hidden">
            <VerticalFlow active={animActive} />
          </div>

          {/* Row 4: Outputs */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {outputs.map((out) => (
              <motion.button
                key={out.id}
                onClick={() => setSelected(out.id)}
                whileHover={{ scale: 1.02 }}
                className="rounded-2xl border p-4 text-left transition-all"
                style={{
                  background: selected === out.id ? out.bg : "rgba(15,20,32,0.8)",
                  borderColor: selected === out.id ? out.border : "rgba(6,182,212,0.08)",
                  boxShadow: selected === out.id ? `0 0 20px ${out.bg}` : "none",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ color: out.color }}>{out.icon}</span>
                  <span className="text-white text-sm" style={{ fontWeight: 700 }}>
                    {out.label}
                  </span>
                  <span
                    className="ml-auto text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: out.bg,
                      color: out.color,
                      fontWeight: 600,
                    }}
                  >
                    {out.pct}
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{out.desc}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <AnimatePresence mode="wait">
          {selectedNode && (
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border p-6"
              style={{
                background: selectedNode.bg,
                borderColor: selectedNode.border,
                boxShadow: `0 0 40px ${selectedNode.glow}30`,
              }}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${selectedNode.border}`,
                    color: selectedNode.color,
                  }}
                >
                  {selectedNode.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white">{selectedNode.label}</h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        color: selectedNode.color,
                        fontWeight: 600,
                      }}
                    >
                      {selectedNode.sublabel}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">{selectedNode.desc}</p>
                </div>
                {selectedNode.stats && (
                  <div className="flex flex-wrap gap-4 lg:flex-shrink-0">
                    {selectedNode.stats.map((stat) => (
                      <div key={stat.label} className="text-right">
                        <p className="text-white text-sm" style={{ fontWeight: 700, color: selectedNode.color }}>
                          {stat.value}
                        </p>
                        <p className="text-slate-400 text-xs">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AWS Services Legend ── */}
        <div
          className="mt-6 rounded-2xl border p-5"
          style={{
            background: "rgba(15,20,32,0.6)",
            borderColor: "rgba(6,182,212,0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400 text-xs" style={{ fontWeight: 600 }}>
              AWS Services & Technologies
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { service: "Amazon Kinesis", use: "Real-time event ingestion", color: "#f97316" },
              { service: "Amazon SageMaker", use: "Tabular ML inference", color: "#a855f7" },
              { service: "Amazon Neptune", use: "Graph neural network", color: "#06b6d4" },
              { service: "Amazon Bedrock", use: "LLM orchestration (Claude 3.5)", color: "#f97316" },
              { service: "AWS Lambda", use: "Serverless decision routing", color: "#22c55e" },
              { service: "Amazon DynamoDB", use: "Low-latency case store", color: "#06b6d4" },
              { service: "Amazon SNS/SQS", use: "Alert distribution", color: "#f59e0b" },
              { service: "AWS CloudWatch", use: "Monitoring & observability", color: "#64748b" },
            ].map((item) => (
              <div
                key={item.service}
                className="rounded-lg p-3 border"
                style={{
                  background: "rgba(6,182,212,0.02)",
                  borderColor: "rgba(6,182,212,0.08)",
                }}
              >
                <p
                  className="text-xs mb-0.5"
                  style={{ color: item.color, fontWeight: 600 }}
                >
                  {item.service}
                </p>
                <p className="text-slate-500 text-xs">{item.use}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
