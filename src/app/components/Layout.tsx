import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  Shield,
  Activity,
  Sliders,
  Bell,
  ChevronRight,
  Zap,
  Eye,
  TrendingUp,
  Users,
  ArrowLeftRight,
  Trash2,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  API_BASE,
  ApiDecision,
  normalizeApiDecision,
  parseApiPayload,
} from "../guardianApi";

const navItems = [
  {
    to: "/executive",
    icon: TrendingUp,
    label: "Executive",
    sublabel: "Platform Overview",
  },
  {
    to: "/ops",
    icon: Activity,
    label: "Guardian Ops",
    sublabel: "Command Center",
  },

  {
    to: "/manual-review",
    icon: Eye,
    label: "Manual Review",
    sublabel: "Investigation Workspace",
  },
  {
    to: "/settings",
    icon: Sliders,
    label: "AI Sensitivity",
    sublabel: "Self-Correcting Loop",
  },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [alertCount, setAlertCount] = useState(0);
  const [engineConfidence, setEngineConfidence] = useState(0);
  const [time, setTime] = useState(new Date());
  const [clearingData, setClearingData] = useState(false);
  const [clearStatus, setClearStatus] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isClientView = location.pathname === "/client";

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;

    type SidebarEvent = {
      decision: ApiDecision;
      risk_prob?: number;
      unified_risk?: number;
    };

    function toConfidence(event: SidebarEvent) {
      const explicit = Number(event.risk_prob ?? event.unified_risk);
      const normalized = Number.isFinite(explicit)
        ? Math.max(0, Math.min(1, explicit))
        : normalizeApiDecision(event.decision) === "APPROVE"
          ? 0.2
          : 0.8;

      return normalizeApiDecision(event.decision) === "APPROVE"
        ? (1 - normalized) * 100
        : normalized * 100;
    }

    async function fetchSidebarMetrics() {
      try {
        const response = await fetch(`${API_BASE}/events`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        const parsed = await parseApiPayload<SidebarEvent[]>(response);
        const events = (Array.isArray(parsed) ? parsed : []).map((event) => ({
          ...event,
          decision: normalizeApiDecision(event.decision),
        }));

        if (!active) return;

        setAlertCount(events.filter((event) => event.decision !== "APPROVE").length);
        const averageConfidence =
          events.length > 0
            ? events.reduce((sum, event) => sum + toConfidence(event), 0) / events.length
            : 0;
        setEngineConfidence(Number(averageConfidence.toFixed(1)));
      } catch (error) {
        if (!active) return;
        console.error("Failed to fetch sidebar metrics:", error);
      }
    }

    void fetchSidebarMetrics();
    const interval = setInterval(fetchSidebarMetrics, 5000);
    const handleDataReset = () => {
      void fetchSidebarMetrics();
    };

    window.addEventListener("guardian:data-reset", handleDataReset);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("guardian:data-reset", handleDataReset);
    };
  }, []);

  async function clearTransactionData() {
    const confirmed = window.confirm(
      "Clear all transaction records from DynamoDB? This cannot be undone."
    );
    if (!confirmed) return;

    setClearingData(true);
    setClearStatus("");

    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const parsed = await parseApiPayload<{ cleared?: number; message?: string }>(response);
      setClearStatus(parsed.message || `Cleared ${parsed.cleared ?? 0} transactions.`);
      setAlertCount(0);
      window.dispatchEvent(
        new CustomEvent("guardian:data-reset", {
          detail: parsed,
        })
      );
    } catch (error) {
      setClearStatus(error instanceof Error ? error.message : "Failed to clear transactions.");
    } finally {
      setClearingData(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0b0e14] md:h-screen">
      <button
        type="button"
        onClick={() => setMobileNavOpen((current) => !current)}
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-[#0f1420]/90 text-cyan-300 shadow-lg shadow-black/30 backdrop-blur md:hidden"
        aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
      >
        {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[86vw] flex-shrink-0 flex-col border-r border-cyan-500/10 bg-[#0f1420] transition-transform duration-300 md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="border-b border-cyan-500/10 p-5 pt-16 md:pt-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#0f1420] animate-pulse" />
            </div>
            <div>
              <p className="text-white text-sm" style={{ fontWeight: 600 }}>
                Guardian AI
              </p>
              <p className="text-cyan-400/60 text-xs">AI Fraud Shield v2.4</p>
            </div>
          </div>
        </div>

        {/* Live time */}
        <div className="px-5 py-3 border-b border-cyan-500/10">
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-cyan-400" />
            <span className="text-cyan-400/70 text-xs font-mono">
              {time.toLocaleTimeString()}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs">LIVE</span>
            </span>
          </div>
        </div>

        {/* View toggle */}
        <div className="px-3 py-3 border-b border-cyan-500/10">
          <div className="flex rounded-lg overflow-hidden border border-cyan-500/20 text-xs font-semibold">
            <button
              onClick={() => navigate("/executive")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                !isClientView
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <Users className="w-3 h-3" />
              Admin
            </button>
            <button
              onClick={() => navigate("/client")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                isClientView
                  ? "bg-purple-500/20 text-purple-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <ArrowLeftRight className="w-3 h-3" />
              Client
            </button>
          </div>
        </div>

        {/* Navigation */}
        {isClientView ? (
          <nav className="flex-1 p-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-sm font-medium">
              <ArrowLeftRight className="w-4 h-4" />
              Transfers
            </div>
          </nav>
        ) : (
          <>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                        isActive
                          ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                          : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${isActive ? "bg-cyan-500/20" : "bg-slate-800 group-hover:bg-slate-700"}`}>
                          <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-white"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${isActive ? "text-cyan-300" : ""}`} style={{ fontWeight: 500 }}>{item.label}</p>
                          <p className="text-xs text-slate-500 truncate">{item.sublabel}</p>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            {/* Alert Badge */}
            <div className="p-3 border-t border-cyan-500/10">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-orange-500/20 rounded-md flex items-center justify-center relative">
                    <Bell className="w-3.5 h-3.5 text-orange-400" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-white flex items-center justify-center text-[9px]" style={{ fontWeight: 700 }}>{alertCount}</span>
                  </div>
                  <div>
                    <p className="text-orange-300 text-xs" style={{ fontWeight: 600 }}>Active Alerts</p>
                    <p className="text-orange-400/60 text-xs">Requires review</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* AI Status */}
        {!isClientView && (
        <div className="px-4 pb-4">
          <div className="bg-[#0b0e14] border border-cyan-500/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-400 text-xs" style={{ fontWeight: 600 }}>
                AI Engine
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Inference</span>
                <span className="text-green-400">Active</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Model</span>
                <span className="text-cyan-400">Bedrock v3</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Confidence</span>
                <span className="text-green-400">{engineConfidence.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="mt-3 bg-[#0b0e14] border border-red-500/10 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-red-300 text-xs" style={{ fontWeight: 600 }}>
                  Data Controls
                </p>
                <p className="text-slate-500 text-xs">Clear DynamoDB event history</p>
              </div>
              <button
                onClick={clearTransactionData}
                disabled={clearingData}
                className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clearingData ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {clearingData ? "Clearing..." : "Clear Data"}
              </button>
            </div>
            {clearStatus && (
              <p className={`mt-2 text-[11px] ${clearStatus.toLowerCase().includes("failed") || clearStatus.toLowerCase().includes("http") ? "text-red-300" : "text-green-300"}`}>
                {clearStatus}
              </p>
            )}
          </div>
        </div>
        )}
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
