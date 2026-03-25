import { useState, useEffect } from "react";
import { X, Shield, Smartphone, Key, Info, CheckCircle } from "lucide-react";
import { motion } from "motion/react";

interface SecurityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Simple QR code SVG pattern
function QRCodeSVG() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      className="rounded-lg"
    >
      <rect width="120" height="120" fill="#fff" />
      {/* TL corner */}
      <rect x="10" y="10" width="30" height="30" rx="2" fill="#0f1420" />
      <rect x="15" y="15" width="20" height="20" rx="1" fill="#fff" />
      <rect x="19" y="19" width="12" height="12" fill="#0f1420" />
      {/* TR corner */}
      <rect x="80" y="10" width="30" height="30" rx="2" fill="#0f1420" />
      <rect x="85" y="15" width="20" height="20" rx="1" fill="#fff" />
      <rect x="89" y="19" width="12" height="12" fill="#0f1420" />
      {/* BL corner */}
      <rect x="10" y="80" width="30" height="30" rx="2" fill="#0f1420" />
      <rect x="15" y="85" width="20" height="20" rx="1" fill="#fff" />
      <rect x="19" y="89" width="12" height="12" fill="#0f1420" />
      {/* Data bits */}
      {[
        [48, 10], [56, 10], [64, 10], [72, 10],
        [48, 18], [64, 18], [72, 18],
        [48, 26], [56, 26], [72, 26],
        [48, 34], [56, 34], [64, 34],
        [10, 48], [18, 48], [34, 48], [48, 48], [56, 48], [72, 48], [80, 48], [96, 48], [104, 48],
        [10, 56], [26, 56], [40, 56], [56, 56], [64, 56], [80, 56], [96, 56],
        [10, 64], [18, 64], [34, 64], [48, 64], [72, 64], [88, 64], [104, 64],
        [10, 72], [26, 72], [56, 72], [64, 72], [80, 72], [104, 72],
        [48, 80], [64, 80], [80, 80], [88, 80], [96, 80],
        [48, 88], [56, 88], [72, 88], [80, 88], [104, 88],
        [48, 96], [64, 96], [88, 96], [96, 96], [104, 96],
        [48, 104], [56, 104], [80, 104], [96, 104],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="6" height="6" fill="#0f1420" />
      ))}
    </svg>
  );
}

export function SecurityVerificationModal({ isOpen, onClose }: SecurityVerificationModalProps) {
  const [step, setStep] = useState<"qr" | "key" | "success">("qr");
  const [showTooltip, setShowTooltip] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const [pulseShield, setPulseShield] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setStep("qr");
      setCountdown(120);
      return;
    }
    const interval = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = () => {
    setStep("success");
    setTimeout(onClose, 2000);
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Glassmorphism Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative w-full max-w-md z-10"
        style={{
          background:
            "linear-gradient(135deg, rgba(15,20,32,0.9) 0%, rgba(11,14,20,0.95) 100%)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(6,182,212,0.25)",
          borderRadius: "20px",
          boxShadow:
            "0 0 60px rgba(6,182,212,0.15), 0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="p-7">
          {step === "success" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-400" />
              </div>
              <h2 className="text-white text-center">Verification Complete</h2>
              <p className="text-slate-400 text-sm text-center">
                Identity confirmed. Proceeding with transfer...
              </p>
            </motion.div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col items-center mb-6">
                {/* Animated Shield */}
                <motion.div
                  animate={{ scale: pulseShield ? [1, 1.05, 1] : 1 }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative mb-4"
                >
                  <div className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: "radial-gradient(circle, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 70%)",
                      boxShadow: "0 0 30px rgba(6,182,212,0.3)",
                    }}
                  >
                    <Shield className="w-10 h-10 text-cyan-400" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: "2s" }} />
                </motion.div>

                <h2 className="text-white text-xl text-center mb-1">Verification Required</h2>
                <div className="flex items-center gap-1.5">
                  <p className="text-slate-400 text-sm text-center">
                    Expires in
                  </p>
                  <span className="font-mono text-orange-400 text-sm">
                    {minutes}:{seconds.toString().padStart(2, "0")}
                  </span>
                </div>
              </div>

              {/* AI Detection Notice */}
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-4 py-3 mb-5">
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0 animate-pulse" />
                  <p className="text-orange-300 text-xs leading-relaxed">
                    Our AI agent detected a{" "}
                    <span style={{ fontWeight: 600 }}>change in interaction rhythm</span>{" "}
                    and unusual location for this session. Additional verification is required.
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setStep("qr")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all border ${
                    step === "qr"
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                      : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Mobile App
                </button>
                <button
                  onClick={() => setStep("key")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all border ${
                    step === "key"
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                      : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  Hardware Key
                </button>
              </div>

              {/* QR or Key content */}
              {step === "qr" ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-3 bg-white rounded-xl">
                    <QRCodeSVG />
                  </div>
                  <p className="text-slate-400 text-xs text-center">
                    Scan with your Guardian Bank mobile app to confirm this transfer
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-center">
                    <Key className="w-8 h-8 text-cyan-400" />
                  </div>
                  <p className="text-slate-300 text-sm text-center">
                    Insert your hardware security key and press the button
                  </p>
                  <div className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-center">
                    <span className="text-slate-500 text-sm">Waiting for key press...</span>
                  </div>
                </div>
              )}

              {/* Security Logic Tooltip */}
              <div className="mt-5 relative">
                <button
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                >
                  <Info className="w-3 h-3" />
                  Why am I seeing this?
                </button>
                {showTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full left-0 mb-2 w-64 bg-slate-800 border border-slate-700 rounded-lg p-3 z-10"
                    style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                  >
                    <p className="text-slate-300 text-xs leading-relaxed">
                      <span className="text-cyan-400" style={{ fontWeight: 600 }}>Security Logic:</span> Guardian AI
                      monitors behavioral biometrics including typing rhythm, mouse
                      movement, and session context. Deviations trigger step-up
                      authentication to prevent social engineering and account takeover attacks.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Demo verify button */}
              <button
                onClick={handleVerify}
                className="mt-4 w-full py-3 rounded-xl text-sm transition-all"
                style={{
                  background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                  color: "white",
                  fontWeight: 600,
                  boxShadow: "0 4px 20px rgba(6,182,212,0.3)",
                }}
              >
                Simulate Verification Success
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
