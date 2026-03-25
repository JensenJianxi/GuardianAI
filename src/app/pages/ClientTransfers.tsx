import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowDown,
  ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  API_BASE,
  ApiDecision,
  formatUsd,
  normalizeApiDecision,
  parseApiPayload,
  updateEventReviewDecision,
} from "../guardianApi";
import {
  VERIFICATION_PHRASE,
  buildDeviceProfile,
  captureGeolocation,
  captureMotionSignature,
  deriveSwipeSteadiness,
  deriveTypingSpeed,
  getMotionPermissionState,
  hasUsableMotionSignature,
  MotionPermissionState,
  requestMotionPermission,
  supportsGeolocationCapture,
  supportsMotionCapture,
  trimKeypressSample,
} from "../guardianCapture";
type UiDecision = "APPROVED" | "RISKED" | "BLOCKED" | "PENDING";

type IngestResponse = {
  event_id: string;
  user_id: string;
  decision: ApiDecision;
  risk_prob: number;
  bms: number;
  gmrs: number;
  gtrs: number;
  unified_risk: number;
  reason: string;
  timestamp: string;
  top_signals?: string[];
};

type ApiEvent = {
  event_id: string;
  user_id: string;
  amount?: number;
  decision: ApiDecision;
  reason?: string;
  timestamp: string;
  backend_decision?: ApiDecision | string;
  review_decision?: ApiDecision | string;
  review_source?: string;
};

type Transfer = {
  eventId: string;
  id: string;
  recipient: string;
  amount?: number;
  createdAt: number;
  date: string;
  decision: UiDecision;
  label: string;
  incoming?: boolean;
  reason?: string;
  backendDecision: ApiDecision;
};

type IdentityChallenge = {
  transfer: Transfer;
};

const DAILY_LIMIT = 1000000;
const MIN_TRANSFER_AMOUNT = 0.01;
const ACCOUNT_NUMBER_LENGTH = 12;

function normalizePhrase(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatTransferDate(timestamp: number) {
  return new Date(timestamp)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", " •");
}

function isSameLocalDay(left: number, right: number) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function badgeClass(decision: UiDecision) {
  if (decision === "APPROVED") return "bg-green-500/20 text-green-400 border border-green-500/30";
  if (decision === "RISKED") return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
  if (decision === "BLOCKED") return "bg-red-500/20 text-red-400 border border-red-500/30";
  return "bg-purple-500/20 text-purple-400 border border-purple-500/30";
}

function normalizeRecipient(value: string) {
  return value.replace(/\D/g, "").slice(0, ACCOUNT_NUMBER_LENGTH);
}

function formatTransferRecipient(recipient: string, incoming?: boolean) {
  return incoming ? recipient : `Transfer to ${recipient}`;
}

function sanitizeAmountInput(value: string) {
  const digitsAndDots = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fractionChunks] = digitsAndDots.split(".");
  const fraction = fractionChunks.join("").slice(0, 2);
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");

  if (digitsAndDots.startsWith(".")) {
    return `0${fraction ? `.${fraction}` : "."}`;
  }

  if (fractionChunks.length === 0) {
    return normalizedWhole;
  }

  return `${normalizedWhole || "0"}.${fraction}`;
}

function parseTransferAmount(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  return Math.round(parsed * 100) / 100;
}

function normalizeTransferAmount(value: number | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(Math.abs(numeric) * 100) / 100;
}

function getTransferValidationError({
  recipient,
  amount,
  remainingLimit,
}: {
  recipient: string;
  amount: string;
  remainingLimit: number;
}) {
  const normalizedRecipient = normalizeRecipient(recipient);
  if (!normalizedRecipient) {
    return "Enter a 12-digit account number.";
  }

  if (normalizedRecipient.length !== ACCOUNT_NUMBER_LENGTH) {
    return `Account number must be exactly ${ACCOUNT_NUMBER_LENGTH} digits.`;
  }

  if (!amount.trim()) {
    return "Enter an amount to transfer.";
  }

  const numericAmount = parseTransferAmount(amount);
  if (numericAmount == null) {
    return "Enter a valid amount with up to 2 decimal places.";
  }

  if (numericAmount < MIN_TRANSFER_AMOUNT) {
    return `Minimum transfer amount is ${formatUsd(MIN_TRANSFER_AMOUNT)}.`;
  }

  if (remainingLimit <= 0) {
    return "You have reached your daily transfer limit.";
  }

  if (numericAmount > remainingLimit) {
    return `This transfer exceeds your remaining daily limit of ${formatUsd(remainingLimit)}.`;
  }

  return "";
}

function TxIcon({ decision, incoming }: { decision: UiDecision; incoming?: boolean }) {
  const base = "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0";
  if (incoming) return <div className={`${base} bg-green-500/20`}><ArrowDown className="w-5 h-5 text-green-400" /></div>;
  if (decision === "APPROVED") return <div className={`${base} bg-emerald-500/20`}><CheckCircle className="w-5 h-5 text-emerald-400" /></div>;
  if (decision === "RISKED") return <div className={`${base} bg-yellow-500/20`}><Clock className="w-5 h-5 text-yellow-400" /></div>;
  if (decision === "BLOCKED") return <div className={`${base} bg-red-500/20`}><AlertTriangle className="w-5 h-5 text-red-400" /></div>;
  return <div className={`${base} bg-purple-500/20`}><Clock className="w-5 h-5 text-purple-400" /></div>;
}

function mapDecision(apiDecision: ApiDecision): UiDecision {
  if (apiDecision === "APPROVE") return "APPROVED";
  if (apiDecision === "FREEZE") return "BLOCKED";
  return "RISKED";
}

function buildLabel(apiDecision: ApiDecision): string {
  if (apiDecision === "APPROVE") return "APPROVED BY AI";
  if (apiDecision === "FREEZE") return "SECURITY HOLD";
  return "STEP-UP VERIFICATION";
}


function toDemoUserId(recipient: string): string {
  const cleaned = normalizeRecipient(recipient);
  return cleaned ? `ACC_${cleaned}` : `ACC_DEMO_${Date.now()}`;
}

function formatRecipientFromUserId(userId: string) {
  const cleaned = String(userId || "")
    .replace(/^ACC_/, "")
    .replace(/_/g, " ")
    .trim();

  return cleaned || "Unknown Recipient";
}

function mapApiEventToTransfer(event: ApiEvent): Transfer {
  const normalizedDecision = normalizeApiDecision(
    event.review_decision ?? event.decision
  );
  const uiDecision = mapDecision(normalizedDecision);
  const backendDecision = normalizeApiDecision(
    event.backend_decision ?? event.decision
  );
  const createdAt = Number.isFinite(Date.parse(event.timestamp))
    ? Date.parse(event.timestamp)
    : Date.now();
  const reviewSource = String(event.review_source || "").trim();
  const releasedByFaceAuth =
    normalizedDecision === "APPROVE" &&
    reviewSource === "CLIENT_FACE_AUTH_PROTOTYPE";

  return {
    eventId: event.event_id,
    id: event.event_id.slice(-8).toUpperCase(),
    recipient: formatRecipientFromUserId(event.user_id),
    amount: normalizeTransferAmount(event.amount),
    createdAt,
    date: formatTransferDate(createdAt),
    decision: uiDecision,
    label: releasedByFaceAuth
      ? "APPROVED AFTER FACE AUTH"
      : buildLabel(normalizedDecision),
    reason: releasedByFaceAuth
      ? "Prototype face authentication completed and the transfer was released as approved."
      : event.reason,
    backendDecision,
  };
}

export function ClientTransfers() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [activityFilter, setActivityFilter] = useState<"all" | "flagged">("all");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const [captureMessage, setCaptureMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [verificationText, setVerificationText] = useState("");
  const [identityChallenge, setIdentityChallenge] = useState<IdentityChallenge | null>(null);
  const [faceAuthStatus, setFaceAuthStatus] = useState<"idle" | "scanning" | "updating" | "verified">("idle");
  const [faceAuthError, setFaceAuthError] = useState("");
  const [motionPermissionState, setMotionPermissionState] = useState<MotionPermissionState>(() =>
    getMotionPermissionState()
  );
  const keypressRef = useRef<{ press: number[]; release: number[] }>({ press: [], release: [] });
  const faceAuthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = Date.now();
  const motionSupported = supportsMotionCapture();
  const geolocationSupported = supportsGeolocationCapture();
  const phraseMatched = normalizePhrase(verificationText) === VERIFICATION_PHRASE;

  async function fetchTransfersFeed() {
    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const parsed = await parseApiPayload<ApiEvent[]>(res);
      const events = (Array.isArray(parsed) ? parsed : [])
        .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
        .map(mapApiEventToTransfer);

      setTransfers(events);
      setFeedError("");
    } catch (err) {
      console.error("Failed to sync transfer feed:", err);
      setFeedError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void fetchTransfersFeed();
    const interval = setInterval(() => {
      void fetchTransfersFeed();
    }, 5000);

    const handleDataReset = () => {
      void fetchTransfersFeed();
    };

    window.addEventListener("guardian:data-reset", handleDataReset);

    return () => {
      clearInterval(interval);
      window.removeEventListener("guardian:data-reset", handleDataReset);
    };
  }, []);

  useEffect(() => {
    if (showModal) {
      setMotionPermissionState(getMotionPermissionState());
    }
  }, [showModal]);

  useEffect(() => {
    return () => {
      if (faceAuthTimerRef.current) {
        clearTimeout(faceAuthTimerRef.current);
      }
    };
  }, []);

  const used = transfers
    .filter((t) => !t.incoming && isSameLocalDay(t.createdAt, now))
    .reduce((s, t) => s + normalizeTransferAmount(t.amount), 0);
  const usedPct = Math.min((used / DAILY_LIMIT) * 100, 100);
  const remainingLimit = Math.max(DAILY_LIMIT - used, 0);
  const transferValidationError = getTransferValidationError({
    recipient,
    amount,
    remainingLimit,
  });
  const motionStatusLabel = !motionSupported
    ? "No motion sensors"
    : motionPermissionState === "granted"
      ? "Motion ready"
      : motionPermissionState === "denied"
        ? "Motion permission denied"
        : "Motion permission required";
  const motionStatusTone = !motionSupported
    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
    : motionPermissionState === "granted"
      ? "border-green-500/30 bg-green-500/10 text-green-300"
      : motionPermissionState === "denied"
        ? "border-red-500/30 bg-red-500/10 text-red-300"
        : "border-orange-500/30 bg-orange-500/10 text-orange-300";
  const visibleTransfers = activityFilter === "all"
    ? transfers
    : transfers.filter((transfer) => transfer.decision !== "APPROVED");

  function resetCaptureState() {
    setCaptureMessage("");
    setVerificationText("");
    setMotionPermissionState(getMotionPermissionState());
    keypressRef.current = { press: [], release: [] };
  }

  function closeModal() {
    setShowModal(false);
    setError("");
    resetCaptureState();
  }

  function closeIdentityChallenge() {
    if (faceAuthTimerRef.current) {
      clearTimeout(faceAuthTimerRef.current);
      faceAuthTimerRef.current = null;
    }
    setFaceAuthStatus("idle");
    setFaceAuthError("");
    setIdentityChallenge(null);
  }

  function openIdentityChallenge(transfer: Transfer) {
    if (faceAuthTimerRef.current) {
      clearTimeout(faceAuthTimerRef.current);
      faceAuthTimerRef.current = null;
    }
    setFaceAuthStatus("idle");
    setFaceAuthError("");
    setIdentityChallenge({ transfer });
  }

  async function completePrototypeFaceAuth(transfer: Transfer) {
    setFaceAuthStatus("updating");
    setFaceAuthError("");

    try {
      await updateEventReviewDecision({
        eventId: transfer.eventId,
        decision: "APPROVE",
        backendDecision: transfer.backendDecision,
        reviewSource: "CLIENT_FACE_AUTH_PROTOTYPE",
      });

      const approvedTransfer: Transfer = {
        ...transfer,
        decision: "APPROVED",
        label: "APPROVED AFTER FACE AUTH",
        reason:
          "Prototype face authentication completed and the transfer was released as approved.",
      };

      setTransfers((prev) =>
        prev.map((current) =>
          current.eventId === approvedTransfer.eventId ? approvedTransfer : current
        )
      );
      setIdentityChallenge({ transfer: approvedTransfer });
      setFaceAuthStatus("verified");
      void fetchTransfersFeed();
    } catch (err) {
      setFaceAuthStatus("idle");
      setFaceAuthError(err instanceof Error ? err.message : String(err));
    }
  }

  function startPrototypeFaceAuth() {
    if (!identityChallenge || faceAuthStatus === "scanning" || faceAuthStatus === "updating") return;

    const challengedTransfer = identityChallenge.transfer;
    setFaceAuthError("");
    setFaceAuthStatus("scanning");
    faceAuthTimerRef.current = setTimeout(() => {
      faceAuthTimerRef.current = null;
      void completePrototypeFaceAuth(challengedTransfer);
    }, 1800);
  }

  function captureKeydown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.repeat || event.key.length !== 1) return;
    if (keypressRef.current.press.length >= 40) return;
    keypressRef.current.press.push(Date.now());
  }

  function captureKeyup(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key.length !== 1) return;
    if (keypressRef.current.release.length >= 40) return;
    keypressRef.current.release.push(Date.now());
  }

  async function enableMotionAccess() {
    setCaptureMessage("Requesting motion permission for full mobile biometric capture...");
    const permission = await requestMotionPermission();
    setMotionPermissionState(permission);

    if (permission === "granted") {
      setCaptureMessage("Motion access granted. Guardian can now try full live biometric capture.");
      return;
    }

    if (permission === "denied") {
      setCaptureMessage(
        "Motion access was denied. Guardian can still verify the transfer, but it will fall back to reduced-signal mode unless you allow motion access in your browser settings."
      );
      return;
    }

    setCaptureMessage(
      "Motion sensors are unavailable on this device, so Guardian will use reduced-signal verification."
    );
  }

  async function submitTransfer() {
    if (!recipient.trim() || !amount) return;

    setLoading(true);
    setError("");

    const validationError = getTransferValidationError({
      recipient,
      amount,
      remainingLimit,
    });
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    const numericAmount = parseTransferAmount(amount);
    const normalizedRecipient = normalizeRecipient(recipient);
    if (numericAmount == null || !normalizedRecipient) {
      setError("Please review the transfer details and try again.");
      setLoading(false);
      return;
    }

    if (!phraseMatched) {
      setError("Type the verification phrase exactly to capture your live typing rhythm.");
      setLoading(false);
      return;
    }

    const keypress = trimKeypressSample(keypressRef.current.press, keypressRef.current.release);
    if (keypress.press_systimes.length < 8 || keypress.release_systimes.length < 8) {
      setError("We need a longer typing sample. Please re-type the verification phrase once more.");
      setLoading(false);
      return;
    }

    const userId = toDemoUserId(normalizedRecipient);

    try {
      setCaptureMessage(
        motionSupported
          ? motionPermissionState === "required"
            ? "Guardian is requesting motion access now. Keep your phone steady for a moment..."
            : "Collecting live device motion. Keep your phone steady for a moment..."
          : "Motion sensors unavailable on this device. Using reduced-signal verification."
      );
      const motion = motionSupported ? await captureMotionSignature() : { signature: [], sampleCount: 0, status: "unsupported" as const };
      setMotionPermissionState(motion.status === "denied" ? "denied" : motionSupported ? "granted" : "unsupported");
      const hasLiveSignature = hasUsableMotionSignature(motion);
      const device = buildDeviceProfile();

      if (motionSupported && !hasLiveSignature) {
        setCaptureMessage(
          motion.status === "captured"
            ? "Motion capture was too weak for full biometric scoring. Falling back to reduced-signal verification."
            : "Motion capture unavailable. Falling back to reduced-signal verification."
        );
      }

      setCaptureMessage(
        geolocationSupported
          ? "Requesting location for live session verification..."
          : "Geolocation unavailable. Continuing with device behavior only..."
      );
      const geo = await captureGeolocation();
      const derivedMotionPermissionState = motionSupported
        ? motion.status === "denied"
          ? "denied"
          : "granted"
        : "unsupported";

      const payload = {
        event_id: crypto.randomUUID(),
        user_id: userId,
        amount: numericAmount,
        keypress,
        typing_speed: deriveTypingSpeed(keypress.press_systimes),
        ...(hasLiveSignature
          ? {
              signature: motion.signature,
              swipe_steadiness: deriveSwipeSteadiness(motion.signature),
            }
          : {}),
        capture_mode: hasLiveSignature ? "live_biometric" : "reduced_signal",
        motion_capture: {
          status: motion.status,
          sample_count: motion.sampleCount,
        },
        motion_permission_state: derivedMotionPermissionState,
        session: {
          submitted_at: new Date().toISOString(),
          verification_phrase_matched: phraseMatched,
          keypress_sample_count: keypress.press_systimes.length,
        },
        ...(geo ? { geo } : {}),
        device,
      };

      setCaptureMessage(hasLiveSignature ? "Submitting live biometric payload to Guardian AI..." : "Submitting reduced-signal verification payload to Guardian AI...");
      const res = await fetch(`${API_BASE}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const parsed = await parseApiPayload<IngestResponse>(res);
      const normalizedDecision = normalizeApiDecision(parsed.decision);
      const newTransfer = mapApiEventToTransfer({
        event_id: parsed.event_id,
        user_id: parsed.user_id,
        amount: numericAmount,
        decision: normalizedDecision,
        reason: parsed.reason,
        timestamp: parsed.timestamp,
      });
      const requiresIdentityChallenge =
        newTransfer.decision === "RISKED" || newTransfer.decision === "BLOCKED";

      setTransfers((prev) => [newTransfer, ...prev.filter((tx) => tx.id !== newTransfer.id)]);
      void fetchTransfersFeed();
      setShowModal(false);
      setRecipient("");
      setAmount("");
      resetCaptureState();
      if (requiresIdentityChallenge) {
        openIdentityChallenge(newTransfer);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaptureMessage("");
      setLoading(false);
    }
  }

  const approvedCount = transfers.filter(t => t.decision === "APPROVED").length;

  return (
    <div className="min-h-full flex flex-col overflow-hidden" style={{ background: "#0d0b14", color: "#fff" }}>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-white/5 px-4 py-4 sm:px-8 sm:py-5">
          <h1 className="text-xl font-bold">Transfers &amp; Movement History</h1>
          <p className="text-slate-400 text-sm mt-0.5">Real-time GMRS fraud verification enabled</p>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="grid max-w-5xl grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <div className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold tracking-widest text-slate-300 uppercase">Daily Transfer Limit</span>
                  </div>
                  <div className="relative group">
                    <button
                      type="button"
                      className="text-slate-500 text-xs"
                      aria-label="Daily transfer limit information"
                    >
                      ⓘ
                    </button>
                    <div className="pointer-events-none absolute right-0 top-6 z-10 w-56 rounded-xl border border-white/10 bg-[#171325] px-3 py-2 text-left text-[11px] text-slate-300 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:w-64">
                      Your daily limit is the maximum total you can send in one local calendar day. It resets the next day and includes all outgoing transfers from this live account feed.
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-sm mt-3 mb-2">
                  <span className="text-white font-medium">Used: {formatUsd(used)}</span>
                  <span className="text-slate-400">Total Limit: {formatUsd(DAILY_LIMIT)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #7c3aed, #a855f7)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${usedPct}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
                <p className="text-purple-400 text-xs mt-2">Cold-start restriction active: 50% of standard limit</p>
              </div>

              <div className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-bold text-lg">Recent Activity</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityFilter("all")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        activityFilter === "all"
                          ? "bg-purple-600/30 border border-purple-500/40 text-purple-300"
                          : "border border-white/10 text-slate-400 hover:border-white/20"
                      }`}
                    >
                      All Time
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityFilter("flagged")}
                      className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                        activityFilter === "flagged"
                          ? "bg-purple-600/30 border border-purple-500/40 text-purple-300 font-medium"
                          : "border border-white/10 text-slate-400 hover:border-white/20"
                      }`}
                    >
                      Filtered
                    </button>
                  </div>
                </div>
                {feedError && (
                  <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    Live sync issue: {feedError}
                  </p>
                )}
                <div className="space-y-3">
                  {!feedError && visibleTransfers.length === 0 && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-400">
                      {activityFilter === "all"
                        ? "No live transfer activity yet. Submit a transfer to populate this feed."
                        : "No flagged transfers in the current live feed."}
                    </div>
                  )}
                  <AnimatePresence initial={false}>
                    {visibleTransfers.map((tx) => (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-3 rounded-xl border border-white/5 p-3 transition-colors hover:border-white/10 sm:flex-row sm:items-center sm:gap-4"
                        style={{ background: "rgba(255,255,255,0.02)" }}
                      >
                        <TxIcon decision={tx.decision} incoming={tx.incoming} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{formatTransferRecipient(tx.recipient, tx.incoming)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${badgeClass(tx.decision)}`}>{tx.label}</span>
                          </div>
                          <p className="text-slate-500 text-xs mt-0.5">⏱ {tx.date}</p>
                          {tx.reason && (
                            <p className="text-slate-400 text-xs mt-1 line-clamp-2">{tx.reason}</p>
                          )}
                          {tx.decision === "BLOCKED" && (
                            <p className="text-red-400 text-xs mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Transfer held for fraud review
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 sm:text-right">
                          <p className={`font-bold text-sm ${tx.incoming ? "text-green-400" : "text-white"}`}>
                            {tx.incoming ? "+" : "-"}{formatUsd(tx.amount)}
                          </p>
                          <p className="text-slate-500 text-xs">ID: {tx.id}</p>
                          {tx.decision === "BLOCKED" && (
                            <button className="text-purple-400 text-xs hover:text-purple-300 transition-colors">
                              Review Details
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Active Verifications</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{approvedCount}</span>
                  <span className="text-green-400 font-semibold">Secure</span>
                </div>
                <p className="text-slate-500 text-xs mt-2">All outgoing nodes verified via Guardian AI</p>
              </div>

              <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9)" }}>
                <h3 className="font-bold text-lg mb-1">New Movement</h3>
                <p className="text-purple-200 text-sm mb-4">Initiate a secure transfer using live typing, device motion, and location verification.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 transition-colors font-semibold text-sm"
                >
                  ▷ New Secure Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 p-5 sm:mx-0 sm:p-6"
              style={{ background: "#13101f" }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-purple-600/30 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">New Secure Transfer</h2>
                  <p className="text-slate-400 text-xs">Verified via Guardian AI fraud engine</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Live Capture Mode</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Type the verification phrase below, then Guardian will attempt to collect location and device motion before submission.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className={`rounded-full border px-2 py-1 ${motionStatusTone}`}>
                      {motionStatusLabel}
                    </span>
                    <span className={`rounded-full border px-2 py-1 ${geolocationSupported ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"}`}>
                      {geolocationSupported ? "Geolocation available" : "Geolocation unavailable"}
                    </span>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                    Device fingerprint means a short hashed label made from your browser and device context, like platform, touch support, and user-agent. It is not your Face ID, fingerprint sensor, or phone serial number.
                  </p>
                  {motionSupported && motionPermissionState !== "granted" ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={enableMotionAccess}
                        disabled={loading}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15 disabled:opacity-50"
                      >
                        {motionPermissionState === "denied" ? "Retry Motion Access" : "Enable Motion"}
                      </button>
                      <p className="text-[11px] text-slate-400">
                        {motionPermissionState === "denied"
                          ? "Motion access is currently denied, so Guardian will fall back to reduced-signal verification unless you re-allow it."
                          : "Tap this first on mobile to give Guardian the best chance of collecting live motion before you send the transfer."}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Recipient Account Number</label>
                  <input
                    value={recipient}
                    onChange={e => setRecipient(normalizeRecipient(e.target.value))}
                    placeholder="e.g. 123456789012"
                    disabled={loading}
                    maxLength={ACCOUNT_NUMBER_LENGTH}
                    inputMode="numeric"
                    pattern="\d*"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                  <p className="mt-2 text-[11px] text-slate-500">
                    Enter exactly 12 digits. Spaces, letters, and special characters are not allowed.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Amount (USD)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(sanitizeAmountInput(e.target.value))}
                    placeholder="0.00"
                    disabled={loading}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                  <p className={`mt-2 text-[11px] ${remainingLimit > 0 ? "text-slate-500" : "text-red-400"}`}>
                    Transfers must be at least {formatUsd(MIN_TRANSFER_AMOUNT)} and stay within your remaining daily limit of {formatUsd(remainingLimit)}.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Verification Phrase</label>
                  <div className="mb-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-cyan-300">
                    {VERIFICATION_PHRASE}
                  </div>
                  <input
                    value={verificationText}
                    onChange={(event) => {
                      if (event.target.value === "") {
                        keypressRef.current = { press: [], release: [] };
                      }
                      setVerificationText(event.target.value);
                    }}
                    onKeyDown={captureKeydown}
                    onKeyUp={captureKeyup}
                    placeholder="Type the phrase exactly once"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                  />
                  <p className={`mt-2 text-[11px] ${phraseMatched ? "text-green-300" : "text-slate-500"}`}>
                    {phraseMatched
                      ? "Typing sample captured and phrase confirmed."
                      : "Guardian uses this field to capture real keystroke timing for the Lambda payload."}
                  </p>
                </div>

                {captureMessage && (
                  <p className="text-cyan-300 text-xs rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
                    {captureMessage}
                  </p>
                )}

                {error && (
                  <p className="text-red-400 text-xs rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:border-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitTransfer}
                    disabled={loading || !phraseMatched || Boolean(transferValidationError)}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                  >
                    {loading ? "Verifying..." : "Send Transfer"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {identityChallenge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
            style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }}
            onClick={(event) => event.target === event.currentTarget && closeIdentityChallenge()}
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              className="mx-4 w-full max-w-md rounded-3xl border border-cyan-500/20 p-5 shadow-2xl sm:mx-0 sm:p-6"
              style={{ background: "#120f1d" }}
            >
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/15">
                  <ShieldAlert className="h-5 w-5 text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-white">Verify your identity now</h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] ${
                        identityChallenge.transfer.decision === "BLOCKED"
                          ? "border-red-500/30 bg-red-500/10 text-red-300"
                          : "border-orange-500/30 bg-orange-500/10 text-orange-300"
                      }`}
                    >
                      {identityChallenge.transfer.decision === "BLOCKED"
                        ? "Security hold"
                        : "Step-up required"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    Guardian flagged this transfer and is asking for a prototype face-authentication step.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Amount</p>
                      <p className="mt-1 font-semibold text-white">
                        {formatUsd(identityChallenge.transfer.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Recipient</p>
                      <p className="mt-1 font-mono text-cyan-300">
                        {identityChallenge.transfer.recipient}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">
                    {identityChallenge.transfer.reason ||
                      "Prototype review triggered after Guardian returned a high-friction decision for this transfer."}
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                    Prototype Notice
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    This button is demo-only. It does not open the camera, capture a face, or run real biometric matching yet.
                  </p>

                  <div className="mt-4 flex items-center gap-3">
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/25 bg-[#0d1220]">
                      <div className="absolute inset-2 rounded-xl border border-cyan-400/30" />
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          faceAuthStatus === "verified"
                            ? "bg-green-400"
                            : faceAuthStatus === "scanning"
                              ? "bg-cyan-400 animate-pulse"
                              : "bg-cyan-500/70"
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">Face Authentication</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {faceAuthStatus === "verified"
                          ? "Prototype face-auth completed and the transaction was patched to approved."
                          : faceAuthStatus === "scanning"
                            ? "Simulating face scan for demo purposes..."
                            : faceAuthStatus === "updating"
                              ? "Updating the transaction status to approved..."
                            : "Launch a fake face-auth step to show how a real step-up journey would feel."}
                      </p>
                    </div>
                  </div>
                </div>

                {faceAuthError && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                    Face-auth prototype failed to update the transaction: {faceAuthError}
                  </div>
                )}

                {faceAuthStatus === "verified" && (
                  <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-200">
                    Prototype success: the user experience completed a mock face-auth challenge and the transfer status was updated to approved through the review API.
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeIdentityChallenge}
                    disabled={faceAuthStatus === "scanning" || faceAuthStatus === "updating"}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-slate-400 transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {faceAuthStatus === "verified" ? "Done" : "Not Now"}
                  </button>
                  <button
                    type="button"
                    onClick={startPrototypeFaceAuth}
                    disabled={faceAuthStatus !== "idle"}
                    className="flex-1 rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {faceAuthStatus === "scanning"
                      ? "Simulating Face Authentication..."
                      : faceAuthStatus === "updating"
                        ? "Updating Transfer..."
                      : faceAuthStatus === "verified"
                        ? "Face Authentication Complete"
                        : "Face Authentication"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
